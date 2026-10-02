/**
 * BillingPrimitives — the small presentational pieces every Billing screen
 * (Invoices, Services & pricing, Expenses) shares so they read as one
 * family with LabOrdersTab / SpecimenTrackingTab:
 *
 *   SectionHeader   — h1 + subtitle on the left, actions on the right
 *   StatTiles       — the clickable KPI tiles (one bucket per row)
 *   FilterChips     — pill filters with counts
 *   SearchBox       — search input with a clear button
 *   LaneHeader      — "Needs action" / "Everything else" lane titles
 *   LoadingRows     — skeleton while the first fetch is in flight
 *   EmptyState      — nothing-in-this-filter / nothing-at-all card
 *   DetailDrawer    — centered dialog on ≥sm, bottom sheet on phones
 *   Field           — label/value pair used inside the drawer
 *   fmtMoney        — "$1,234.56"
 *
 * Deliberately UI-only. No data access lives here.
 */

import React, { useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search, X, type LucideIcon } from 'lucide-react';

export const BRAND = '#B91C1C';

export const fmtMoney = (n: number, opts: { cents?: boolean } = {}) =>
  (opts.cents ? n / 100 : n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Whole-dollar display for tiles ("$1,235"). */
export const fmtMoneyShort = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const TILE_BASE =
  'text-left rounded-lg border px-3 py-2.5 min-h-[64px] snap-start transition shadow-sm ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40';

export const CHIP_BASE =
  'inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40';

export const TH =
  'h-9 text-[11px] uppercase tracking-wider text-gray-500';
export const TH_STICKY =
  'sticky right-0 z-10 bg-gray-50 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)] h-9 text-[11px] uppercase tracking-wider text-gray-500 text-right pr-3';
export const TD_STICKY =
  'sticky right-0 z-10 py-2 align-top pr-3 bg-white shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]';

export const rowKeyHandler = (open: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
};

// ──────────────────────────────────────────────────────────────────
// Header
// ──────────────────────────────────────────────────────────────────
export const SectionHeader: React.FC<{
  icon: LucideIcon;
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

// ──────────────────────────────────────────────────────────────────
// Tiles + chips
// ──────────────────────────────────────────────────────────────────
export interface TileDef<K extends string> {
  key: K;
  label: string;
  desc: string;
  /** Active tile classes (border/bg/text). */
  tile: string;
  /** Secondary line under the count, e.g. a money amount. */
  sub?: React.ReactNode;
  /** Highlight the count red when non-zero and not active (needs-action tiles). */
  alert?: boolean;
}

export function StatTiles<K extends string>({ tiles, counts, active, loading, onSelect, ariaLabel, cols = 5 }: {
  tiles: Array<TileDef<K>>;
  counts: Record<K, number>;
  active: K | string;
  loading: boolean;
  onSelect: (k: K) => void;
  ariaLabel: string;
  cols?: 4 | 5;
}) {
  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible snap-x">
      <div
        className={cn('grid grid-flow-col auto-cols-[46%] sm:auto-cols-auto sm:grid-flow-row gap-2', cols === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-5')}
        role="group"
        aria-label={ariaLabel}
      >
        {tiles.map(t => {
          const isActive = active === t.key;
          const n = counts[t.key] ?? 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onSelect(t.key)}
              aria-pressed={isActive}
              title={t.desc}
              className={cn(TILE_BASE, isActive ? cn('ring-2 ring-[#B91C1C]/30', t.tile) : 'bg-white border-gray-200 hover:border-[#B91C1C]/40')}
            >
              <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 truncate">{t.label}</p>
              <p className={cn('text-2xl font-bold leading-tight mt-0.5', t.alert && n > 0 && !isActive && 'text-red-700')}>
                {loading ? '–' : n}
              </p>
              {t.sub !== undefined && (
                <p className="text-[11px] text-gray-500 mt-0.5 truncate tabular-nums">{loading ? '' : t.sub}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface ChipDef<K extends string> {
  key: K;
  label: string;
  desc?: string;
  /** Dot colour class, omitted for "All"/"Needs action". */
  dot?: string;
}

export function FilterChips<K extends string>({ chips, counts, active, onSelect, ariaLabel }: {
  chips: Array<ChipDef<K>>;
  counts: Record<K, number>;
  active: K | string;
  onSelect: (k: K) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:flex-wrap" role="group" aria-label={ariaLabel}>
      {chips.map(c => {
        const isActive = active === c.key;
        const n = counts[c.key] ?? 0;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onSelect(c.key)}
            aria-pressed={isActive}
            title={c.desc}
            className={cn(
              CHIP_BASE,
              isActive ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
              !isActive && n === 0 && 'text-gray-400',
            )}
          >
            {c.dot && <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-white' : c.dot)} aria-hidden="true" />}
            {c.label}
            <span className={cn('tabular-nums', isActive ? 'opacity-90' : 'text-gray-500')}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

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

// ──────────────────────────────────────────────────────────────────
// Lanes, loading, empty
// ──────────────────────────────────────────────────────────────────
export const LaneHeader: React.FC<{ id: string; title: string; count: number; tone: 'red' | 'gray'; hint?: string }> = ({ id, title, count, tone, hint }) => (
  <div className="flex items-center gap-2 mb-2 flex-wrap">
    <h2 id={id} className={cn('text-sm font-bold', tone === 'red' ? 'text-red-800' : 'text-gray-700')}>{title}</h2>
    <span className={cn('inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold rounded-full', tone === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')}>{count}</span>
    {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
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
  icon: LucideIcon;
  total: number;
  hasSearch: boolean;
  filterLabel: string;
  filterDesc?: string;
  nothingTitle: string;
  nothingHint: string;
  searchHint: string;
  noun: string;
  onReset: () => void;
  action?: React.ReactNode;
}> = ({ icon: Icon, total, hasSearch, filterLabel, filterDesc, nothingTitle, nothingHint, searchHint, noun, onReset, action }) => (
  <Card className="border-dashed">
    <CardContent className="p-8 text-center">
      <Icon className="h-10 w-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
      {total === 0 ? (
        <>
          <p className="text-sm font-semibold text-gray-700">{nothingTitle}</p>
          <p className="text-xs text-gray-500 mt-1">{nothingHint}</p>
          {action && <div className="mt-3 flex justify-center">{action}</div>}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-700">
            {hasSearch ? 'Nothing matches your search.' : `Nothing in "${filterLabel}".`}
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

export const ErrorBanner: React.FC<{ title: string; message: string; onRetry: () => void }> = ({ title, message, onRetry }) => (
  <Card className="border-red-300 bg-red-50" role="alert">
    <CardContent className="p-3 flex items-start gap-2">
      <div className="text-xs flex-1">
        <p className="font-semibold text-red-800">{title}</p>
        <p className="text-red-700 mt-0.5 font-mono break-all">{message}</p>
        <p className="text-red-600 mt-1">If this says "JWT" or "401/403", log out and back in to refresh your session.</p>
      </div>
      <Button variant="outline" size="sm" className="h-9 text-xs" onClick={onRetry}>Retry</Button>
    </CardContent>
  </Card>
);

// ──────────────────────────────────────────────────────────────────
// Drawer
// ──────────────────────────────────────────────────────────────────
export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <span className="text-gray-500">{label}</span>
    <span className="min-w-0 break-words">{children}</span>
  </>
);

export const FieldGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-1.5 text-sm">
    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">{title}</p>
    <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">{children}</div>
  </div>
);

export const DetailDrawer: React.FC<{
  eyebrow: string;
  title: string;
  titleId: string;
  headerExtra?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}> = ({ eyebrow, title, titleId, headerExtra, onClose, children, maxWidth = 'sm:max-w-4xl' }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('w-full mt-auto sm:mt-0 sm:max-h-[92vh] max-h-[90vh] overflow-y-auto shadow-2xl rounded-b-none sm:rounded-lg rounded-t-2xl', maxWidth)}
        onClick={(e) => e.stopPropagation()}
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
                {headerExtra && <div className="flex items-center gap-2 mt-1.5 flex-wrap">{headerExtra}</div>}
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

export const Pill: React.FC<{ className: string; dot?: string; children: React.ReactNode; title?: string }> = ({ className, dot, children, title }) => (
  <span title={title} className={cn('inline-flex items-center gap-1 px-2 h-6 rounded-full border text-[11px] font-semibold whitespace-nowrap', className)}>
    {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dot)} aria-hidden="true" />}
    {children}
  </span>
);

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
