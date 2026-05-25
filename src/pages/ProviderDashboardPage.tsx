/**
 * ProviderDashboardPage — partner portal MVP.
 *
 * Single-screen patient panel for the partner practice. Pulls every
 * appointment tied to their organization_id (last 12 months), groups
 * by status, lets them see at a glance: who's scheduled, who's still
 * missing a lab order, who's drawn, who's done.
 *
 * Phase 1A scope (tonight): READ ONLY. No "order a draw" action yet.
 * The point is to make the warm cold-email lead say "OK this is real."
 *
 * Auth: token in sessionStorage (claimed via /provider/auth/:token).
 * If missing → redirect to a friendly "your link expired" page.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Building2, Users, CheckCircle2, Clock, AlertCircle, FileText, MapPin, LogOut } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

interface PatientRow {
  id: string;
  patient_name: string;
  patient_email: string | null;
  appointment_date: string;
  appointment_time: string | null;
  service_type: string;
  lab_destination: string | null;
  status: string;
  payment_status: string | null;
  lab_order_uploaded: boolean;
  collection_at: string | null;
  billed_to: string | null;
  total_amount: number | null;
  display_status: string;
}

interface Stats {
  total: number;
  scheduled: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  awaiting_lab_order: number;
}

interface OrgInfo {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  address_city: string | null;
  address_state: string | null;
}

const STATUS_PILL: Record<string, { label: string; className: string }> = {
  awaiting_lab_order: { label: 'Awaiting lab order', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  ready_to_draw:     { label: 'Ready to draw',      className: 'bg-blue-50 text-blue-800 border-blue-200' },
  in_progress:       { label: 'In progress',         className: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  specimen_delivered:{ label: 'Specimen delivered',  className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  completed:         { label: 'Completed',           className: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  cancelled:         { label: 'Cancelled',           className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const ProviderDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const token = sessionStorage.getItem('convelabs_provider_token');
    if (!token) {
      navigate('/provider/login');
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/get-provider-dashboard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ token }),
        });
        const j = await r.json();
        if (!r.ok || !j?.ok) {
          sessionStorage.removeItem('convelabs_provider_token');
          sessionStorage.removeItem('convelabs_provider_org');
          setError(j?.error || `Failed to load dashboard (${r.status})`);
          return;
        }
        setOrg(j.organization);
        setStats(j.stats);
        setRows(j.patients || []);
      } catch (e: any) {
        setError(e?.message || 'Network error');
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const logout = () => {
    sessionStorage.removeItem('convelabs_provider_token');
    sessionStorage.removeItem('convelabs_provider_org');
    navigate('/provider/login');
  };

  const filteredRows = filter === 'all' ? rows : rows.filter(r => r.display_status === filter);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 text-[#B91C1C] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <AlertCircle className="h-10 w-10 mx-auto text-amber-600 mb-3" />
          <h1 className="text-lg font-semibold text-gray-900">Session ended</h1>
          <p className="text-sm text-gray-600 mt-2">{error}</p>
          <p className="text-xs text-gray-500 mt-4">Your provider access link is single-tab and expires 24 hours after first use. Reply to the original email or call <a href="tel:+19415279169" className="text-[#B91C1C] font-semibold">(941) 527-9169</a> for a fresh one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-[#B91C1C] text-white flex items-center justify-center flex-shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-gray-900 truncate">{org?.name || 'Provider Dashboard'}</h1>
              <p className="text-[11px] text-gray-500">ConveLabs Provider Portal</p>
            </div>
          </div>
          <button onClick={logout} className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-gray-100">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats strip */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <button onClick={() => setFilter('all')} className={`text-left bg-white rounded-xl border p-4 transition hover:border-gray-300 ${filter==='all' ? 'border-[#B91C1C] ring-2 ring-red-100' : 'border-gray-200'}`}>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Total</div>
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            </button>
            <button onClick={() => setFilter('awaiting_lab_order')} className={`text-left bg-white rounded-xl border p-4 transition hover:border-gray-300 ${filter==='awaiting_lab_order' ? 'border-amber-500 ring-2 ring-amber-100' : 'border-gray-200'}`}>
              <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Awaiting order</div>
              <div className="text-2xl font-bold text-amber-700">{stats.awaiting_lab_order}</div>
            </button>
            <button onClick={() => setFilter('ready_to_draw')} className={`text-left bg-white rounded-xl border p-4 transition hover:border-gray-300 ${filter==='ready_to_draw' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'}`}>
              <div className="text-[10px] uppercase tracking-wider text-blue-700 font-semibold">Scheduled</div>
              <div className="text-2xl font-bold text-blue-700">{stats.scheduled}</div>
            </button>
            <button onClick={() => setFilter('specimen_delivered')} className={`text-left bg-white rounded-xl border p-4 transition hover:border-gray-300 ${filter==='specimen_delivered' ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-gray-200'}`}>
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Drawn</div>
              <div className="text-2xl font-bold text-emerald-700">{stats.in_progress}</div>
            </button>
            <button onClick={() => setFilter('completed')} className={`text-left bg-white rounded-xl border p-4 transition hover:border-gray-300 ${filter==='completed' ? 'border-emerald-700 ring-2 ring-emerald-200' : 'border-gray-200'}`}>
              <div className="text-[10px] uppercase tracking-wider text-emerald-800 font-semibold">Completed</div>
              <div className="text-2xl font-bold text-emerald-900">{stats.completed}</div>
            </button>
          </div>
        )}

        {/* Patient list */}
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" /> Your patients
              <span className="text-xs text-gray-500 font-normal">({filteredRows.length} of {rows.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              {filter !== 'all' && (
                <button onClick={() => setFilter('all')} className="text-xs text-gray-500 hover:text-gray-900">Clear filter</button>
              )}
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              {rows.length === 0 ? 'No patients on file yet. As patients book through ConveLabs and tie back to your practice, they\'ll appear here.' : 'No patients in this status.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredRows.map(r => {
                const meta = STATUS_PILL[r.display_status] || { label: r.display_status, className: 'bg-gray-100 text-gray-700 border-gray-200' };
                return (
                  <div key={r.id} className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 truncate">{r.patient_name}</div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{format(parseISO(String(r.appointment_date).substring(0,10) + 'T12:00:00'), 'MMM d, yyyy')}{r.appointment_time ? ` · ${r.appointment_time}` : ''}</span>
                        <span>·</span>
                        <span>{r.service_type}</span>
                        {r.lab_destination && (<><span>·</span><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{r.lab_destination}</span></>)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {r.lab_order_uploaded && <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold"><FileText className="h-3 w-3" />Order</span>}
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 ${meta.className}`}>{meta.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* MVP footer note */}
        <p className="text-[11px] text-gray-400 text-center">
          ConveLabs Provider Portal · Beta · Order-draw + monthly billing summary coming this week. Questions? Reply to your invite email or call <a href="tel:+19415279169" className="text-[#B91C1C] font-medium">(941) 527-9169</a>.
        </p>
      </main>
    </div>
  );
};

export default ProviderDashboardPage;
