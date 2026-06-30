/**
 * AddCompanionPage — /add-companion/:token
 *
 * Self-service "add someone to my existing visit + pay the difference."
 * The patient lands here from a tokenized SMS/email link, adds companion(s),
 * picks the SAME time slot (discounted companion fee) or a DIFFERENT date
 * (full visit price — separate trip), then pays. The companion appointment
 * row(s) are created by stripe-webhook on payment. Token-only; no PHI in URL.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertTriangle, UserPlus, X, CalendarClock, CalendarPlus } from 'lucide-react';

const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let m = 6 * 60; m <= 13 * 60 + 30; m += 15) {
    const h = Math.floor(m / 60), mm = m % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const hr = h > 12 ? h - 12 : h;
    out.push(`${hr}:${String(mm).padStart(2, '0')} ${period}`);
  }
  return out;
})();

interface Details {
  ok: boolean;
  primary: { first_name: string; date: string; time: string | null; service_name: string; service_type: string; lab_destination: string | null };
  is_specialty: boolean;
  tier: string;
  same_slot_fee_cents: number;
  different_date_fee_cents: number;
  kit_options?: Array<{ serviceType: string; label: string; same_cents: number; different_cents: number }>;
}
interface Companion { firstName: string; lastName: string; dob: string; kitsCount: number; kitType: string | null; }

const prettyDate = (d: string | null) => {
  if (!d) return '';
  try { return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  catch { return String(d); }
};

const AddCompanionPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [when, setWhen] = useState<'same' | 'different'>('same');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [availSlots, setAvailSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [companions, setCompanions] = useState<Companion[]>([{ firstName: '', lastName: '', dob: '', kitsCount: 1, kitType: null }]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/add-companion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ action: 'details', token }),
        });
        const j = await res.json();
        if (!res.ok || !j.ok) {
          setError(
            j.error === 'expired' ? 'This link has expired. Please contact us for a new one.'
            : j.error === 'already_used' ? 'This link has already been used.'
            : j.error === 'voided' ? 'That appointment is no longer active.'
            : "We couldn't find this link."
          );
        } else { setData(j); }
      } catch { setError('Something went wrong loading this link.'); }
      finally { setLoading(false); }
    })();
  }, [token]);

  // Live availability for a chosen different-date — fetch open time slots.
  useEffect(() => {
    if (when !== 'different' || !date || !token) { setAvailSlots(null); return; }
    let cancelled = false;
    setSlotsLoading(true); setTime('');
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/add-companion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ action: 'slots', token, date }),
        });
        const j = await res.json();
        if (!cancelled) setAvailSlots(Array.isArray(j?.slots) ? j.slots : []);
      } catch { if (!cancelled) setAvailSlots(null); }
      finally { if (!cancelled) setSlotsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [when, date, token]);

  const unitFee = when === 'same' ? (data?.same_slot_fee_cents || 0) : (data?.different_date_fee_cents || 0);
  const kitOpt = (st: string | null) => data?.kit_options?.find(k => k.serviceType === st) || null;
  // Client estimate (server recomputes authoritatively, incl. specialty kits).
  const estimate = useMemo(() => companions.reduce((s, c) => {
    // Companion opted into a specialty kit (primary is a standard draw):
    if (c.kitType && !data?.is_specialty) {
      const opt = kitOpt(c.kitType);
      return s + (opt ? (when === 'same' ? opt.same_cents : opt.different_cents) : unitFee);
    }
    const kits = data?.is_specialty ? Math.max(1, Number(c.kitsCount || 1)) : 1;
    const extra = data?.is_specialty ? (kits - 1) * 3500 : 0;
    return s + unitFee + extra;
  }, 0), [companions, unitFee, when, data]);

  const updateCompanion = (i: number, patch: Partial<Companion>) =>
    setCompanions(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const addCompanion = () => setCompanions(cs => [...cs, { firstName: '', lastName: '', dob: '', kitsCount: 1, kitType: null }]);
  const removeCompanion = (i: number) => setCompanions(cs => cs.filter((_, idx) => idx !== i));

  const valid = companions.every(c => c.firstName.trim() && c.lastName.trim())
    && (when === 'same' || (date && time));

  async function handlePay() {
    if (!token || submitting || !valid) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/add-companion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          action: 'checkout', token, when, date, time,
          companions: companions.map(c => ({
            firstName: c.firstName, lastName: c.lastName, dob: c.dob,
            kitsCount: c.kitsCount,
            // Only send serviceType when the companion opted into a kit and the
            // primary isn't already a specialty visit.
            serviceType: (!data?.is_specialty && c.kitType) ? c.kitType : undefined,
          })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.stripe_url) { window.location.href = j.stripe_url; return; }
      setSubmitError(
        j.error === 'already_used' ? 'This link has already been used.'
        : j.error === 'expired' || j.error === 'voided' ? 'This link is no longer valid.'
        : j.error === 'date_required' ? 'Please pick a date and time.'
        : "We couldn't start checkout. Please try again or call (941) 527-9169."
      );
    } catch { setSubmitError("We couldn't start checkout. Please try again or call (941) 527-9169."); }
    finally { setSubmitting(false); }
  }

  if (loading) return <Centered><Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" /></Centered>;
  if (error || !data) return (
    <Centered>
      <div className="text-center max-w-sm">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <p className="text-gray-800 font-semibold mb-1">Can't open this link</p>
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    </Centered>
  );

  const p = data.primary;
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-white py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#B91C1C] to-[#991B1B] text-white px-6 py-5">
            <div className="flex items-center gap-2"><UserPlus className="h-5 w-5" /><h1 className="text-lg font-bold">Add someone to your visit</h1></div>
            <p className="text-sm text-white/85 mt-1">Hi {p.first_name} — add a companion to your appointment and we'll see them too.</p>
          </div>

          <div className="px-6 py-4 bg-rose-50/40 border-b text-sm">
            <p className="font-semibold text-gray-900">{p.service_name}</p>
            <p className="text-gray-600">{prettyDate(p.date)}{p.time ? ` · ${p.time}` : ''}</p>
            {p.lab_destination && <p className="text-gray-500 text-xs mt-0.5">Lab: {p.lab_destination}</p>}
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* When */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">When should we see them?</p>
              <div className="grid grid-cols-1 gap-2">
                <button type="button" onClick={() => setWhen('same')}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left ${when === 'same' ? 'border-[#B91C1C] ring-2 ring-[#B91C1C]/15 bg-rose-50/40' : 'border-gray-200'}`}>
                  <CalendarClock className="h-4 w-4 mt-0.5 text-[#B91C1C]" />
                  <div><p className="text-sm font-semibold text-gray-900">Same visit — {prettyDate(p.date)}{p.time ? `, ${p.time}` : ''}</p>
                    <p className="text-xs text-gray-600">Discounted companion rate ({fmt(data.same_slot_fee_cents)} each)</p></div>
                </button>
                <button type="button" onClick={() => setWhen('different')}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left ${when === 'different' ? 'border-[#B91C1C] ring-2 ring-[#B91C1C]/15 bg-rose-50/40' : 'border-gray-200'}`}>
                  <CalendarPlus className="h-4 w-4 mt-0.5 text-[#B91C1C]" />
                  <div><p className="text-sm font-semibold text-gray-900">A different day</p>
                    <p className="text-xs text-gray-600">Separate visit ({fmt(data.different_date_fee_cents)} each — own trip)</p></div>
                </button>
              </div>
              {when === 'different' && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
                  <select value={time} onChange={e => setTime(e.target.value)} disabled={slotsLoading} className="border border-gray-300 rounded-md px-3 py-2 text-sm disabled:opacity-60">
                    <option value="">{slotsLoading ? 'Checking availability…' : (availSlots && availSlots.length === 0 ? 'No times — try another day' : 'Pick a time')}</option>
                    {(availSlots ?? TIME_SLOTS).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Companions */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Who's joining?</p>
              <div className="space-y-3">
                {companions.map((c, i) => (
                  <div key={i} className="rounded-lg border border-dashed border-gray-300 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500">Companion {i + 1}</span>
                      {companions.length > 1 && <button type="button" onClick={() => removeCompanion(i)}><X className="h-4 w-4 text-gray-400" /></button>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="First name" value={c.firstName} onChange={e => updateCompanion(i, { firstName: e.target.value })} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
                      <input placeholder="Last name" value={c.lastName} onChange={e => updateCompanion(i, { lastName: e.target.value })} className="border border-gray-300 rounded-md px-3 py-2 text-sm" />
                      <input type="date" value={c.dob} max={new Date().toISOString().slice(0, 10)} onChange={e => updateCompanion(i, { dob: e.target.value })} className="border border-gray-300 rounded-md px-3 py-2 text-sm col-span-2" />
                      {data.is_specialty && (
                        <div className="col-span-2 flex items-center justify-between">
                          <span className="text-xs text-gray-600">Specialty kits</span>
                          <input type="number" min={1} max={6} value={c.kitsCount} onChange={e => updateCompanion(i, { kitsCount: Math.max(1, Number(e.target.value) || 1) })} className="border border-gray-300 rounded-md px-2 py-1 text-sm w-16 text-center" />
                        </div>
                      )}
                      {!data.is_specialty && data.kit_options && (
                        <div className="col-span-2">
                          <label className="flex items-center gap-2 text-xs text-gray-700">
                            <input type="checkbox" checked={!!c.kitType}
                              onChange={e => updateCompanion(i, { kitType: e.target.checked ? 'specialty-kit' : null })} />
                            This person needs a specialty collection kit
                          </label>
                          {c.kitType && (
                            <select value={c.kitType} onChange={e => updateCompanion(i, { kitType: e.target.value })}
                              className="mt-1.5 border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full">
                              {data.kit_options.map(k => (
                                <option key={k.serviceType} value={k.serviceType}>
                                  {k.label} — {fmt(when === 'same' ? k.same_cents : k.different_cents)}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addCompanion} className="mt-2 text-sm text-[#B91C1C] font-medium flex items-center gap-1">
                <UserPlus className="h-3.5 w-3.5" /> Add another person
              </button>
            </div>
          </div>

          <div className="px-6 py-4 border-t bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-600">{companions.length} companion{companions.length > 1 ? 's' : ''}{data.is_specialty ? ' (est.)' : ''}</span>
              <span className="text-lg font-bold text-gray-900">{fmt(estimate)}</span>
            </div>
            {submitError && <p className="text-xs text-red-600 mb-2">{submitError}</p>}
            <button type="button" disabled={!valid || submitting} onClick={handlePay}
              className="w-full bg-[#B91C1C] hover:bg-[#991B1B] disabled:opacity-50 text-white font-semibold rounded-lg py-3 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? 'Starting checkout…' : `Continue to payment · ${fmt(estimate)}`}
            </button>
            <p className="text-[11px] text-gray-400 text-center mt-2">Secure checkout. You'll see the exact total before paying.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">{children}</div>
);

export default AddCompanionPage;
