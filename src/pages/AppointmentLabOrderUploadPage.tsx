/**
 * AppointmentLabOrderUploadPage — single-purpose, no-auth-wall.
 *
 * Patient lands here from an SMS/email "upload your lab order" link.
 * Hormozi-grade: one page, one job, no detour through dashboard.
 *
 * Route: /appt/:token/upload-order
 *
 * Flow:
 *   1. Mount → call submit-appointment-lab-order (GET) with token.
 *      Returns appointment summary (patient first name, date/time/address,
 *      service, fasting flag, org name) — proves "this link is for you."
 *      Server stamps opened_at on first GET.
 *   2. Drag/drop or take a photo. JPEG/PNG/HEIC/PDF accepted, resized to <5MB.
 *   3. POST file_b64 → server uploads to storage + writes appointment_lab_orders
 *      + stamps appointments.lab_order_file_path + fires OCR.
 *   4. Show "Got it ✓" with appointment summary so patient feels confirmed.
 */

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, FileUp, CheckCircle2, AlertTriangle, Camera } from 'lucide-react';
import { resizeImageForUpload } from '@/lib/imageResize';

const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

interface FamilyMember {
  appointment_id: string;
  patient_name: string;
  patient_first_name: string;
  fasting_required: boolean;
  already_uploaded: boolean;
  is_primary: boolean;
}

interface ApptSummary {
  appointment_id: string;
  patient_first_name: string;
  appointment_date: string;
  appointment_time: string | null;
  address: string | null;
  service_name: string | null;
  lab_destination: string | null;
  fasting_required: boolean | null;
  org_name: string | null;
  family_group_id?: string | null;
  family_members?: FamilyMember[];
}

const AppointmentLabOrderUploadPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ApptSummary | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  // Hormozi auto-magic-link: server returns a Supabase magiclink on
  // successful upload. We surface it as a "View my dashboard" CTA so the
  // patient lands on /dashboard already authed — no password wall, ever.
  const [dashboardMagicLink, setDashboardMagicLink] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError('No token'); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-appointment-lab-order?token=${encodeURIComponent(token)}`, {
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        });
        const j = await res.json();
        if (!res.ok) {
          if (j.error === 'expired') setError('This upload link has expired. Reach out to ConveLabs at info@convelabs.com or (941) 527-9169 and we\'ll send a fresh one.');
          else if (j.error === 'already_uploaded') setError('Looks like a lab order was already uploaded for this visit — you\'re all set!');
          else if (j.error === 'token_not_found') setError('We couldn\'t find this link. Check that it\'s the most recent message we sent you.');
          else setError(j.message || j.error || 'Could not load your appointment.');
        } else {
          setSummary(j.appointment);
        }
      } catch (e: any) {
        setError(e?.message || 'Could not load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Track which family member is currently being uploaded for so we can
  // route the file + show a per-member spinner. null = single-patient
  // mode (token's primary appointment).
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  // Local "this member is done" overlay so the UI flips immediately after
  // upload without needing to re-fetch the summary.
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  async function handleFile(rawFile: File, targetAppointmentId?: string) {
    if (!token || uploading) return;
    setUploading(true);
    if (targetAppointmentId) setActiveMemberId(targetAppointmentId);
    try {
      const file = await resizeImageForUpload(rawFile);
      // base64 encode
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const fileB64 = btoa(binary);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-appointment-lab-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          token,
          file_b64: fileB64,
          content_type: file.type || 'application/pdf',
          original_filename: file.name,
          ...(targetAppointmentId ? { target_appointment_id: targetAppointmentId } : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.message || j.error || 'Upload failed. Please try again or call (941) 527-9169.');
      } else if (targetAppointmentId) {
        // Family-mode upload: mark this member done. Only flip to full
        // success when EVERY sibling has uploaded.
        setDoneIds(prev => {
          const next = new Set(prev);
          next.add(targetAppointmentId);
          // Check completeness against summary
          const allMembers = summary?.family_members || [];
          const stillPending = allMembers.filter(m => !m.already_uploaded && !next.has(m.appointment_id));
          if (stillPending.length === 0) setSuccess(true);
          return next;
        });
        if (j?.dashboard_url) setDashboardMagicLink(j.dashboard_url);
      } else {
        setSuccess(true);
        if (j?.dashboard_url) setDashboardMagicLink(j.dashboard_url);
      }
    } catch (e: any) {
      setError(e?.message || 'Upload crashed.');
    } finally {
      setUploading(false);
      setActiveMemberId(null);
    }
  }

  // Per-family-member file picker. Each card has its own hidden input.
  const memberFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const onMemberChange = (memberId: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f, memberId);
    const el = memberFileRefs.current[memberId];
    if (el) el.value = '';
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Hmm — let's try that again</h1>
          <p className="text-sm text-gray-600">{error}</p>
          <p className="text-xs text-gray-400 mt-4">Email <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a> or call (941) 527-9169.</p>
        </div>
      </div>
    );
  }

  if (success) {
    const dateLabel = summary?.appointment_date
      ? new Date(String(summary.appointment_date).substring(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : '';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-center">
          <div className="bg-emerald-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-4">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Got it ✓</h1>
          <p className="text-sm text-gray-700">Your lab order is on file.</p>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-4 text-left text-sm">
            <p className="text-emerald-900"><strong>See you {dateLabel}{summary?.appointment_time ? ` at ${summary.appointment_time}` : ''}.</strong></p>
            {summary?.fasting_required && (
              <p className="text-amber-800 mt-2">⚠️ <strong>Fasting required</strong> — no food (water OK) for 8–12 hours before your visit. We'll text a reminder the night before.</p>
            )}
            <ul className="text-xs text-gray-700 mt-3 space-y-0.5 list-disc list-inside">
              <li>Wear a short-sleeve shirt</li>
              <li>Drink water tonight (helps the draw)</li>
              <li>Have a photo ID + insurance card ready</li>
            </ul>
          </div>
          {/* Hormozi auto-magic-link CTA — patient is one tap away from
              their dashboard with no password wall. Biggest "wow" of
              the post-upload experience. */}
          {dashboardMagicLink && (
            <a
              href={dashboardMagicLink}
              className="inline-block mt-4 w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white font-semibold rounded-xl px-5 py-3 text-sm transition"
            >
              View my dashboard →
            </a>
          )}
          <p className="text-xs text-gray-400 mt-4">Need to reach us? <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a> · (941) 527-9169</p>
        </div>
      </div>
    );
  }

  // Main upload UI
  const dateLabel = summary?.appointment_date
    ? new Date(String(summary.appointment_date).substring(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md w-full mx-auto">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white px-6 py-5">
            <h1 className="text-xl font-bold">Upload your lab order</h1>
            <p className="text-sm opacity-90 mt-0.5">ConveLabs Concierge Lab Services</p>
          </div>

          <div className="p-6">
            {summary && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-sm">
                <p className="text-gray-900">Hi <strong>{summary.patient_first_name}</strong>,</p>
                <p className="text-gray-700 mt-1">This is for your visit on <strong>{dateLabel}{summary.appointment_time ? ` at ${summary.appointment_time}` : ''}</strong>.</p>
                {summary.org_name && (
                  <p className="text-gray-600 text-xs mt-1">Ordered by {summary.org_name}</p>
                )}
                {summary.family_members && summary.family_members.length > 1 && (
                  <p className="text-blue-700 text-xs mt-2 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                    👨‍👩‍👧 <strong>{summary.family_members.length} patients on this visit</strong> — please upload one lab order for each below.
                  </p>
                )}
              </div>
            )}

            {/* FAMILY-GROUP MODE — one card per patient, each with own picker */}
            {summary?.family_members && summary.family_members.length > 1 ? (
              <div className="space-y-3">
                {summary.family_members.map((m) => {
                  const isDone = m.already_uploaded || doneIds.has(m.appointment_id);
                  const isActive = activeMemberId === m.appointment_id && uploading;
                  return (
                    <div
                      key={m.appointment_id}
                      className={`border-2 rounded-xl p-4 transition ${
                        isDone
                          ? 'border-emerald-300 bg-emerald-50/60'
                          : isActive
                            ? 'border-blue-300 bg-blue-50/60'
                            : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {m.patient_name}
                            {m.is_primary && <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-1.5 py-0.5">primary</span>}
                          </p>
                          {m.fasting_required && (
                            <p className="text-[11px] text-amber-700 mt-0.5">⚠ Fasting required for this patient</p>
                          )}
                        </div>
                        {isDone && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" /> Done
                          </span>
                        )}
                      </div>
                      <input
                        ref={(el) => { memberFileRefs.current[m.appointment_id] = el; }}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={onMemberChange(m.appointment_id)}
                      />
                      {!isDone && (
                        <button
                          type="button"
                          onClick={() => memberFileRefs.current[m.appointment_id]?.click()}
                          disabled={uploading}
                          className={`w-full border-2 border-dashed rounded-lg p-4 text-center transition ${
                            isActive
                              ? 'border-blue-200 bg-white'
                              : 'border-[#B91C1C]/30 bg-red-50/30 hover:bg-red-50/60'
                          } ${uploading && !isActive ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {isActive ? (
                            <>
                              <Loader2 className="h-7 w-7 animate-spin text-blue-600 mx-auto mb-1" />
                              <p className="text-sm font-semibold text-blue-800">Uploading {m.patient_first_name}'s order…</p>
                            </>
                          ) : (
                            <>
                              <FileUp className="h-7 w-7 text-[#B91C1C] mx-auto mb-1" />
                              <p className="text-sm font-bold text-gray-900">Upload {m.patient_first_name}'s lab order</p>
                              <p className="text-[10px] text-gray-600 mt-0.5">📷 Photo · 📄 PDF / JPG / PNG</p>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={onChange}
                />

                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className={`w-full border-2 border-dashed rounded-xl p-8 text-center transition ${
                    uploading
                      ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                      : 'border-[#B91C1C]/30 bg-red-50/30 hover:bg-red-50/60 cursor-pointer'
                  }`}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-10 w-10 animate-spin text-[#B91C1C] mx-auto mb-3" />
                      <p className="text-sm font-semibold text-gray-900">Uploading…</p>
                    </>
                  ) : (
                    <>
                      <FileUp className="h-10 w-10 text-[#B91C1C] mx-auto mb-3" />
                      <p className="text-base font-bold text-gray-900">Tap to upload</p>
                      <p className="text-xs text-gray-600 mt-1">📷 Take a photo · 📄 Choose PDF / JPG / PNG</p>
                    </>
                  )}
                </button>
              </>
            )}

            <p className="text-[11px] text-center text-gray-500 mt-3">
              Most patients finish in under 30 seconds.
            </p>

            <div className="mt-6 pt-4 border-t border-gray-100">
              <p className="text-[12px] text-gray-600 leading-relaxed">
                <strong>Don't have your lab order yet?</strong> Ask your doctor's office to fax it to <a href="tel:+19412518467" className="text-[#B91C1C] font-semibold">(941) 251-8467</a> — we'll match it to your visit automatically.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          Questions? <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a> · (941) 527-9169
        </p>
      </div>
    </div>
  );
};

export default AppointmentLabOrderUploadPage;
