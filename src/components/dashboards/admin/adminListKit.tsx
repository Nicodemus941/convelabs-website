/**
 * adminListKit — the small presentational pieces every admin list screen
 * shares, lifted from LabOrdersTab / SpecimenTrackingTab so the Partners and
 * Team screens render in exactly the same language:
 *
 *   header + subtitle + right-aligned actions
 *   KPI tiles (one bucket per row, so tiles / chips / list always agree)
 *   filter chips with counts · search · "Needs action" lane header
 *   desktop table with a sticky right Actions column · md:hidden mobile cards
 *   detail drawer (centered dialog on ≥sm, bottom sheet on phones)
 *   loading / empty / error states
 *
 * Purely presentational. No data access, no role logic.
 */

import React, { useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AlertTriangle, RefreshCw, Search, X } from 'lucide-react';
import { formatDistanceToNowStrict, isValid } from 'date-fns';
import { toast } from 'sonner';

// ──────────────────────────────────────────────────────────────────
// Tiny helpers
// ──────────────────────────────────────────────────────────────────
export const ago = (d: Date | string | null | undefined): string => {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (!isValid(dt)) return '—';
  return formatDistanceToNowStrict(dt, { addSuffix: true });
};

export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error(`Couldn't copy ${what.toLowerCase()}`);
  }
}

/** Enter / Space opens a row when the row itself (not a child control) has focus. */
export const rowKeyHandler = (open: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Shared table classes — identical to LabOrdersTab so columns line up visually.
export const TH = 'h-9 text-[11px] uppercase tracking-wider text-gray-500';
export const TH_STICKY = cn('sticky right-0 z-10 bg-gray-50 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]', TH, 'text-right pr-3');
export const TD_STICKY = 'sticky right-0 z-10 py-2 align-top pr-3 bg-white shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]';
export const ROW_FOCUS = 'cursor-pointer focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40';
export const CARD_FOCUS = 'shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40';

// ──────────────────────────────────────────────────────────────────
// Page header
// ──────────────────────────────────────────────────────────────────
export const PageHeader: React.FC<{
  icon: React.ElementType;
  title: string;
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, actions }) => (
  <div className="flex items-start justify-between gap-3 flex-wrap">
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900">
        <Icon className="h-6 w-6 text-[#B91C1C]" aria-hidden="true" />
        {title}
      </h1>
      <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

export const RefreshButton: React.FC<{ onClick: () => void; loading?: boolean }> = ({ onClick, loading }) => (
  <Button variant="outline" size="sm" onClick={onClick} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
    <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
    <span className="hidden sm:inline">Refresh</span>
  </Button>
);

// ──────────────────────────────────────────────────────────────────
// KPI tiles — click to filter. Together the tiles partition every row.
// ──────────────────────────────────────────────────────────────────
export interface TileDef<K extends string> {
  key: K;
  label: string;
  desc: string;
  /** Active-state classes (border/bg/text). */
  style: string;
  /** Tint the count red when non-zero and inactive (for the "needs action" tile). */
  alert?: boolean;
}

export function StatTiles<K extends string>({ tiles, counts, active, onSelect, loading, ariaLabel, cols }: {
  tiles: TileDef<K>[];
  counts: Record<string, number>;
  active: string;
  /** Called with the tile key, or 'all' when the active tile is clicked again. */
  onSelect: (key: K | 'all') => void;
  loading?: boolean;
  ariaLabel: string;
  /** Desktop column class, e.g. 'sm:grid-cols-5'. Defaults to the tile count (max 6). */
  cols?: string;
}) {
  const colClass = cols || ({ 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 5: 'sm:grid-cols-5', 6: 'sm:grid-cols-6' } as Record<number, string>)[Math.min(tiles.length, 6)];
  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible snap-x">
      <div className={cn('grid grid-flow-col auto-cols-[46%] sm:auto-cols-auto sm:grid-flow-row gap-2', colClass)} role="group" aria-label={ariaLabel}>
        {tiles.map(t => {
          const isActive = active === t.key;
          const n = counts[t.key] ?? 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onSelect(isActive ? 'all' : t.key)}
              aria-pressed={isActive}
              title={t.desc}
              className={cn(
                'text-left rounded-lg border px-3 py-2.5 min-h-[64px] snap-start transition shadow-sm',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                isActive ? cn('ring-2 ring-[#B91C1C]/30', t.style) : 'bg-white border-gray-200 hover:border-[#B91C1C]/40',
              )}
            >
              <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 truncate">{t.label}</p>
              <p className={cn('text-2xl font-bold leading-tight mt-0.5', t.alert && n > 0 && !isActive && 'text-red-700')}>
                {loading ? '–' : n}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Filter chips with counts
// ──────────────────────────────────────────────────────────────────
export interface ChipDef<K extends string> {
  key: K;
  label: string;
  desc: string;
  /** Dot colour class, e.g. 'bg-emerald-500'. Omit for All / Needs action. */
  dot?: string;
}

export function FilterChips<K extends string>({ filters, counts, active, onSelect, ariaLabel }: {
  filters: ChipDef<K>[];
  counts: Record<string, number>;
  active: string;
  onSelect: (key: K) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:flex-wrap" role="group" aria-label={ariaLabel}>
      {filters.map(f => {
        const isActive = active === f.key;
        const n = counts[f.key] ?? 0;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onSelect(f.key)}
            aria-pressed={isActive}
            title={f.desc}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
              isActive ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
              !isActive && n === 0 && 'text-gray-400',
            )}
          >
            {f.dot && <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-white' : f.dot)} aria-hidden="true" />}
            {f.label}
            <span className={cn('tabular-nums', isActive ? 'opacity-90' : 'text-gray-500')}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Search
// ──────────────────────────────────────────────────────────────────
export const SearchBox: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}> = ({ value, onChange, placeholder, ariaLabel, className }) => (
  <div className={cn('relative flex-1', className)}>
    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
    <Input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="h-10 sm:h-9 pl-8 text-sm"
    />
    {value && (
      <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700">
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
);

/** Segmented toggle (List / By provider style). */
export function SegmentedControl<K extends string>({ options, value, onChange, ariaLabel }: {
  options: Array<{ key: K; label: string }>;
  value: K;
  onChange: (k: K) => void;
  ariaLabel: string;
}) {
  return (
    <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="group" aria-label={ariaLabel}>
      {options.map((o, i) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={cn('px-3 h-10 sm:h-9 text-xs font-medium transition', i > 0 && 'border-l border-gray-200', value === o.key ? 'bg-[#B91C1C] text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Lanes / loading / empty / error
// ──────────────────────────────────────────────────────────────────
export const LaneHeader: React.FC<{ id: string; title: string; count: number; tone: 'red' | 'gray' }> = ({ id, title, count, tone }) => (
  <div className="flex items-center gap-2 mb-2">
    <h2 id={id} className={cn('text-sm font-bold', tone === 'red' ? 'text-red-800' : 'text-gray-700')}>{title}</h2>
    <span className={cn('inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold rounded-full', tone === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')}>{count}</span>
  </div>
);

export const LoadingRows: React.FC<{ label: string; rows?: number }> = ({ label, rows = 5 }) => (
  <div className="space-y-1.5" aria-busy="true" aria-label={label}>
    {Array.from({ length: rows }, (_, i) => (
      <Card key={i} className="shadow-sm">
        <CardContent className="p-3 flex items-center gap-3 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="h-3.5 bg-gray-200 rounded w-32" />
              <div className="h-3 bg-gray-100 rounded w-16" />
            </div>
            <div className="h-2.5 bg-gray-100 rounded w-48" />
          </div>
          <div className="h-7 w-20 bg-gray-100 rounded flex-shrink-0 hidden sm:block" />
        </CardContent>
      </Card>
    ))}
  </div>
);

export const EmptyState: React.FC<{
  icon: React.ElementType;
  /** Shown when there are zero rows at all. */
  emptyTitle: string;
  emptyHint: string;
  /** Shown when rows exist but the filter / search hides them all. */
  filterLabel: string;
  filterDesc: string;
  hasSearch: boolean;
  searchHint: string;
  total: number;
  noun: string;
  onReset: () => void;
}> = ({ icon: Icon, emptyTitle, emptyHint, filterLabel, filterDesc, hasSearch, searchHint, total, noun, onReset }) => (
  <Card className="border-dashed">
    <CardContent className="p-8 text-center">
      <Icon className="h-10 w-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
      {total === 0 ? (
        <>
          <p className="text-sm font-semibold text-gray-700">{emptyTitle}</p>
          <p className="text-xs text-gray-500 mt-1">{emptyHint}</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-700">
            {hasSearch ? `No ${noun} match your search.` : `Nothing in "${filterLabel}".`}
          </p>
          <p className="text-xs text-gray-500 mt-1">{hasSearch ? searchHint : filterDesc}</p>
          <Button variant="outline" size="sm" className="mt-3 text-xs h-9" onClick={onReset}>
            Show all {total} {noun}
          </Button>
        </>
      )}
    </CardContent>
  </Card>
);

export const ErrorCard: React.FC<{ what: string; message: string; onRetry: () => void }> = ({ what, message, onRetry }) => (
  <Card className="border-red-300 bg-red-50" role="alert">
    <CardContent className="p-3 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="text-xs flex-1">
        <p className="font-semibold text-red-800">Couldn't load {what}</p>
        <p className="text-red-700 mt-0.5 font-mono break-all">{message}</p>
        <p className="text-red-600 mt-1">If this says "JWT" or "401/403", log out and back in to refresh your session.</p>
      </div>
      <Button variant="outline" size="sm" className="h-9 text-xs" onClick={onRetry}>Retry</Button>
    </CardContent>
  </Card>
);

/** One-line "Showing X of Y" footer. */
export const ListFooter: React.FC<{ shown: number; total: number; noun: string; extra?: string }> = ({ shown, total, noun, extra }) => (
  <p className="text-[11px] text-gray-400">
    Showing {shown} of {plural(total, noun)}{extra ? ` · ${extra}` : ''}
  </p>
);

// ──────────────────────────────────────────────────────────────────
// Status pill + key/value field (used inside drawers and rows)
// ──────────────────────────────────────────────────────────────────
export const Pill: React.FC<{ className: string; dot?: string; children: React.ReactNode; title?: string }> = ({ className, dot, children, title }) => (
  <span title={title} className={cn('inline-flex items-center gap-1 px-2 h-6 rounded-full border text-[11px] font-semibold whitespace-nowrap', className)}>
    {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dot)} aria-hidden="true" />}
    {children}
  </span>
);

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <span className="text-gray-500">{label}</span>
    <span className="min-w-0 break-words">{children}</span>
  </>
);

export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={cn('text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1', className)}>{children}</p>
);

// ──────────────────────────────────────────────────────────────────
// Detail drawer — centered dialog on ≥sm, bottom sheet on phones.
// Same chrome as LabOrderDetailDrawer: red gradient hero, close button,
// Escape to close, body scroll lock, focus moves to Close on open.
// ──────────────────────────────────────────────────────────────────
export const DetailDrawer: React.FC<{
  titleId: string;
  eyebrow: string;
  title: React.ReactNode;
  /** Pills / meta rendered under the title inside the hero. */
  meta?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'md' | 'lg';
}> = ({ titleId, eyebrow, title, meta, onClose, children, size = 'lg' }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('w-full mt-auto sm:mt-0 sm:max-h-[92vh] max-h-[90vh] overflow-y-auto shadow-2xl rounded-b-none sm:rounded-lg rounded-t-2xl', size === 'lg' ? 'sm:max-w-4xl' : 'sm:max-w-2xl')}
        onClick={e => e.stopPropagation()}
      >
        <CardContent className="p-0">
          <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>
          <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white p-4 sm:p-5 sticky top-0 z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider opacity-90">{eyebrow}</p>
                <h2 id={titleId} className="text-lg sm:text-xl font-bold mt-0.5 truncate">{title}</h2>
                {meta && <div className="flex items-center gap-2 mt-1.5 flex-wrap">{meta}</div>}
              </div>
              <Button ref={closeRef} size="sm" variant="ghost" onClick={onClose} className="text-white hover:bg-white/10 h-10 w-10 p-0 flex-shrink-0" aria-label="Close">
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="p-4 sm:p-5 space-y-4">{children}</div>
        </CardContent>
      </Card>
    </div>
  );
};

/** Horizontal quick-action strip used at the top of drawers. */
export const QuickActions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex sm:flex-wrap gap-2 overflow-x-auto sm:overflow-visible -mx-4 sm:mx-0 px-4 sm:px-0 pb-1 sm:pb-0">{children}</div>
);

/** Inline notice (orange = waiting on someone, red = overdue, amber = heads-up, blue = info). */
export const Notice: React.FC<{ tone: 'orange' | 'red' | 'amber' | 'blue' | 'emerald'; icon: React.ElementType; children: React.ReactNode }> = ({ tone, icon: Icon, children }) => {
  const cls = {
    orange: 'border-orange-200 bg-orange-50 text-orange-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone];
  return (
    <div className={cn('rounded-md border p-3 text-xs flex items-start gap-2', cls)}>
      <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};
