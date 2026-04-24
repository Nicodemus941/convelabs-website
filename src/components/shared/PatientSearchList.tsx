import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, isAfter, subDays } from 'date-fns';
import { Search, Users, Send, Pencil } from 'lucide-react';

/**
 * PatientSearchList — shared between admin Org drawer and provider portal.
 *
 * Pure presentational: takes a patient[] + a row-action render prop. Parent
 * owns the data fetch + the "Refer / Edit / Nudge" handlers. This keeps
 * the component reusable across admin (sees-all) and provider (scoped) views.
 *
 * Features:
 *  - Text search across name, email, phone
 *  - Filter chips: All / Active (visit in last 90d) / New (0 visits yet) /
 *    Overdue (pending lab request > deadline)
 *  - Status dot per row (green on-track, amber pending, gray stale, red overdue)
 *  - Counts on each chip so the admin knows at a glance where attention is
 *
 * UI aligns with the luxury email template: cream accents, Georgia
 * eyebrow labels, red accents — mirrors the rest of the platform.
 */

export interface PatientListRow {
  patient_name: string;
  patient_email?: string | null;
  patient_phone?: string | null;
  visit_count?: number | null;
  last_visit_date?: string | null;
  last_service?: string | null;
  pending_request_count?: number | null;
  specimens_delivered_count?: number | null;
}

type Filter = 'all' | 'active' | 'new' | 'overdue';

export interface PatientSearchListProps {
  patients: PatientListRow[];
  loading?: boolean;
  emptyMessage?: string;
  onAddPatient?: () => void;
  renderRowActions?: (patient: PatientListRow) => React.ReactNode;
  onRowClick?: (patient: PatientListRow) => void;
}

const statusFor = (p: PatientListRow): { dot: string; title: string } => {
  if ((p.pending_request_count || 0) > 0) return { dot: 'bg-amber-500', title: 'Pending lab request' };
  if (!p.last_visit_date) return { dot: 'bg-gray-300', title: 'No visits yet' };
  const ninetyAgo = subDays(new Date(), 90);
  if (isAfter(new Date(p.last_visit_date), ninetyAgo)) {
    return { dot: 'bg-emerald-500', title: 'Active (visit in last 90 days)' };
  }
  return { dot: 'bg-gray-400', title: 'Inactive — no recent visits' };
};

const PatientSearchList: React.FC<PatientSearchListProps> = ({
  patients,
  loading,
  emptyMessage = 'No patients yet. Add your first one to get started.',
  onAddPatient,
  renderRowActions,
  onRowClick,
}) => {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    let rows = patients;
    if (filter === 'active') {
      const cutoff = subDays(new Date(), 90);
      rows = rows.filter(p => p.last_visit_date && isAfter(new Date(p.last_visit_date), cutoff));
    } else if (filter === 'new') {
      rows = rows.filter(p => !p.visit_count || p.visit_count === 0);
    } else if (filter === 'overdue') {
      rows = rows.filter(p => (p.pending_request_count || 0) > 0);
    }
    const query = q.trim().toLowerCase();
    if (query) {
      rows = rows.filter(p =>
        (p.patient_name || '').toLowerCase().includes(query) ||
        (p.patient_email || '').toLowerCase().includes(query) ||
        (p.patient_phone || '').replace(/\D/g, '').includes(query.replace(/\D/g, ''))
      );
    }
    return rows;
  }, [patients, q, filter]);

  const counts = useMemo(() => {
    const cutoff = subDays(new Date(), 90);
    return {
      all: patients.length,
      active: patients.filter(p => p.last_visit_date && isAfter(new Date(p.last_visit_date), cutoff)).length,
      new: patients.filter(p => !p.visit_count || p.visit_count === 0).length,
      overdue: patients.filter(p => (p.pending_request_count || 0) > 0).length,
    };
  }, [patients]);

  const Chip: React.FC<{ v: Filter; label: string; n: number; tone?: 'red' | 'amber' }> = ({ v, label, n, tone }) => (
    <button
      type="button"
      onClick={() => setFilter(v)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
        filter === v
          ? (tone === 'amber' ? 'bg-amber-500 text-white border-amber-500' :
             tone === 'red' ? 'bg-[#B91C1C] text-white border-[#B91C1C]' :
             'bg-gray-900 text-white border-gray-900')
          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
      }`}
    >
      {label}
      <span className={`px-1.5 rounded-full text-[10px] ${
        filter === v ? 'bg-white/20' : 'bg-gray-100 text-gray-600'
      }`}>{n}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      {/* Search + add */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, phone…"
            className="pl-9 h-10"
          />
        </div>
        {onAddPatient && (
          <Button
            onClick={onAddPatient}
            size="sm"
            className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-10 px-4 flex-shrink-0"
          >
            <Users className="h-4 w-4" /> Add patient
          </Button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        <Chip v="all" label="All" n={counts.all} />
        <Chip v="active" label="Active" n={counts.active} />
        <Chip v="new" label="New" n={counts.new} />
        {counts.overdue > 0 && <Chip v="overdue" label="⚠ Overdue" n={counts.overdue} tone="amber" />}
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white border rounded-lg divide-y">
          {[0, 1, 2].map(i => (
            <div key={i} className="p-4 animate-pulse">
              <div className="h-4 w-40 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-64 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-10 text-center">
          <Users className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">{q ? `No matches for "${q}"` : emptyMessage}</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {filtered.map((p, i) => {
            const status = statusFor(p);
            return (
              <div
                key={`${p.patient_name}-${i}`}
                onClick={() => onRowClick?.(p)}
                className={`flex items-center gap-3 p-3 sm:p-4 transition ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
              >
                {/* Status dot */}
                <span
                  title={status.title}
                  className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${status.dot}`}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-gray-900 truncate">{p.patient_name}</p>
                    {(p.pending_request_count || 0) > 0 && (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]">
                        {p.pending_request_count} pending
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {p.patient_email && <span>{p.patient_email}</span>}
                    {p.patient_email && p.patient_phone && <span className="mx-1">·</span>}
                    {p.patient_phone && <span>{p.patient_phone}</span>}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {p.visit_count ? `${p.visit_count} visit${p.visit_count === 1 ? '' : 's'}` : 'No visits yet'}
                    {p.last_visit_date && (
                      <> · Last: {formatDistanceToNow(new Date(p.last_visit_date), { addSuffix: true })}</>
                    )}
                    {p.last_service && <> · {p.last_service}</>}
                    {(p.specimens_delivered_count || 0) > 0 && (
                      <> · <span className="text-emerald-700">{p.specimens_delivered_count} delivered</span></>
                    )}
                  </p>
                </div>

                {renderRowActions && (
                  <div className="flex-shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {renderRowActions(p)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PatientSearchList;
