/**
 * sectionUi — the small presentational pieces that make the Growth and Owner
 * screens look like LabOrdersTab / SpecimenTrackingTab (the admin design
 * reference): header + subtitle + right-aligned actions, stat tiles that each
 * map to one bucket, filter chips with counts, lane headers, loading rows,
 * empty states and the bottom-sheet / centered detail drawer.
 *
 * Shared by MarketingTab (Growth) and the Owner screens only. Nothing here
 * touches data — every piece is a pure render helper.
 */
import React, { useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { X, LucideIcon } from 'lucide-react';

export const BRAND_RED = '#B91C1C';

export const fmtMoney = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

export const fmtMoneyPrecise = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

export const fmtPct = (n: number, digits = 1): string => `${(n || 0).toFixed(digits)}%`;

export const fmtInt = (n: number): string => (n || 0).toLocaleString('en-US');

// ──────────────────────────────────────────────────────────────────
// Header — title with icon, subtitle, right-aligned action cluster.
// ──────────────────────────────────────────────────────────────────
export const SectionHeader: React.FC<{
  icon: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, actions }) => (
  <div className="flex items-start justify-between gap-3 flex-wrap">
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900">
        <Icon className="h-6 w-6 text-[#B91C1C]" aria-hidden="true" />
        {title}
      </h1>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

export const SectionTitle: React.FC<{ id?: string; children: React.ReactNode; hint?: React.ReactNode }> = ({ id, children, hint }) => (
  <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
    <h2 id={id} className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{children}</h2>
    {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
  </div>
);

// ──────────────────────────────────────────────────────────────────
// Segmented control — the "List | By provider" toggle from LabOrdersTab.
// ──────────────────────────────────────────────────────────────────
export function Segmented<K extends string>({ value, onChange, options, label }: {
  value: K;
  onChange: (k: K) => void;
  options: Array<{ key: K; label: string }>;
  label: string;
}) {
  return (
    <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="group" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={cn(
            'px-3 h-10 sm:h-9 text-xs font-medium transition whitespace-nowrap',
            i > 0 && 'border-l border-gray-200',
            value === o.key ? 'bg-[#B91C1C] text-white' : 'bg-white text-gray-700 hover:bg-gray-50',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Stat tiles — click to filter. Each tile is ONE bucket.
// ──────────────────────────────────────────────────────────────────
export interface TileDef<K extends string> {
  key: K;
  label: string;
  desc?: string;
  /** Classes applied when the tile is the active filter. */
  activeClass: string;
  /** Emphasise a non-zero count even when inactive (e.g. "Needs action"). */
  alert?: boolean;
}

export function StatTiles<K extends string>({ tiles, counts, active, onToggle, loading, format, cols }: {
  tiles: Array<TileDef<K>>;
  counts: Record<K, number>;
  active: K | null;
  onToggle: (k: K) => void;
  loading?: boolean;
  format?: (k: K, n: number) => string;
  cols?: 4 | 5 | 6;
}) {
  const colClass = cols === 6 ? 'sm:grid-cols-6' : cols === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-5';
  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible snap-x">
      <div className={cn('grid grid-flow-col auto-cols-[46%] sm:auto-cols-auto sm:grid-flow-row gap-2', colClass)} role="group" aria-label="Counts">
        {tiles.map(t => {
          const isActive = active === t.key;
          const n = counts[t.key] ?? 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onToggle(t.key)}
              aria-pressed={isActive}
              title={t.desc}
              className={cn(
                'text-left rounded-lg border px-3 py-2.5 min-h-[64px] snap-start transition shadow-sm',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                isActive ? cn('ring-2 ring-[#B91C1C]/30', t.activeClass) : 'bg-white border-gray-200 hover:border-[#B91C1C]/40',
              )}
            >
              <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 truncate">{t.label}</p>
              <p className={cn('text-2xl font-bold leading-tight mt-0.5 tabular-nums', t.alert && n > 0 && !isActive && 'text-red-700')}>
                {loading ? '–' : format ? format(t.key, n) : fmtInt(n)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Read-only KPI tile (no filtering) — same shell as the clickable tile. */
export const KpiTile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'red' | 'green' | 'amber' | 'brand';
  icon?: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  children?: React.ReactNode;
}> = ({ label, value, hint, tone = 'default', icon: Icon, loading, children }) => {
  const valueTone = {
    default: 'text-gray-900',
    red: 'text-red-700',
    green: 'text-emerald-700',
    amber: 'text-amber-700',
    brand: 'text-[#B91C1C]',
  }[tone];
  return (
    <div className={cn('rounded-lg border bg-white px-3 py-2.5 min-h-[64px] shadow-sm', tone === 'brand' ? 'border-[#B91C1C]/30' : 'border-gray-200')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 truncate">{label}</p>
        {Icon && <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', tone === 'brand' ? 'text-[#B91C1C]' : 'text-gray-400')} aria-hidden="true" />}
      </div>
      <p className={cn('text-2xl font-bold leading-tight mt-0.5 tabular-nums', valueTone)}>{loading ? '–' : value}</p>
      {hint && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{loading ? '' : hint}</p>}
      {children}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// Filter chips with counts.
// ──────────────────────────────────────────────────────────────────
export interface ChipDef<K extends string> { key: K; label: string; desc?: string; dot?: string }

export function FilterChips<K extends string>({ chips, counts, active, onSelect, label }: {
  chips: Array<ChipDef<K>>;
  counts: Record<K, number>;
  active: K;
  onSelect: (k: K) => void;
  label: string;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:flex-wrap" role="group" aria-label={label}>
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
              'inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
              isActive ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
              !isActive && n === 0 && 'text-gray-400',
            )}
          >
            {c.dot && <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-white' : c.dot)} aria-hidden="true" />}
            {c.label}
            <span className={cn('tabular-nums', isActive ? 'opacity-90' : 'text-gray-500')}>{fmtInt(n)}</span>
          </button>
        );
      })}
    </div>
  );
}

export const Pill: React.FC<{ className: string; dot?: string; children: React.ReactNode }> = ({ className, dot, children }) => (
  <span className={cn('inline-flex items-center gap-1 px-2 h-6 rounded-full border text-[11px] font-semibold whitespace-nowrap', className)}>
    {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dot)} aria-hidden="true" />}
    {children}
  </span>
);

export const LaneHeader: React.FC<{ id?: string; title: string; count: number; tone: 'red' | 'gray' | 'amber' }> = ({ id, title, count, tone }) => (
  <div className="flex items-center gap-2 mb-2">
    <h2 id={id} className={cn('text-sm font-bold', tone === 'red' ? 'text-red-800' : tone === 'amber' ? 'text-amber-800' : 'text-gray-700')}>{title}</h2>
    <span className={cn('inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold rounded-full',
      tone === 'red' ? 'bg-red-100 text-red-800' : tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700')}>{count}</span>
  </div>
);

export const LoadingRows: React.FC<{ rows?: number; label?: string }> = ({ rows = 5, label = 'Loading' }) => (
  <div className="space-y-1.5" aria-busy="true" aria-label={label}>
    {Array.from({ length: rows }).map((_, i) => (
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

export const LoadingTiles: React.FC<{ n?: number }> = ({ n = 4 }) => (
  <div className={cn('grid grid-cols-2 gap-2', n >= 6 ? 'sm:grid-cols-6' : n === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4')} aria-busy="true">
    {Array.from({ length: n }).map((_, i) => <div key={i} className="h-16 rounded-lg border border-gray-200 bg-gray-50 animate-pulse" />)}
  </div>
);

export const EmptyState: React.FC<{
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}> = ({ icon: Icon, title, hint, action }) => (
  <Card className="border-dashed">
    <CardContent className="p-8 text-center">
      <Icon className="h-10 w-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      {action && (
        <Button variant="outline" size="sm" className="mt-3 text-xs h-9" onClick={action.onClick}>{action.label}</Button>
      )}
    </CardContent>
  </Card>
);

export const ErrorBanner: React.FC<{ title: string; message: string; onRetry?: () => void }> = ({ title, message, onRetry }) => (
  <Card className="border-red-300 bg-red-50" role="alert">
    <CardContent className="p-3 flex items-start gap-2">
      <div className="text-xs flex-1">
        <p className="font-semibold text-red-800">{title}</p>
        <p className="text-red-700 mt-0.5 font-mono break-all">{message}</p>
      </div>
      {onRetry && <Button variant="outline" size="sm" className="h-9 text-xs" onClick={onRetry}>Retry</Button>}
    </CardContent>
  </Card>
);

/** Table header cell in the reference style. */
export const Th: React.FC<{ children?: React.ReactNode; className?: string; right?: boolean }> = ({ children, className, right }) => (
  <th className={cn('h-9 px-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium whitespace-nowrap', right ? 'text-right' : 'text-left', className)}>{children}</th>
);

/** Sticky right "Actions" header cell. */
export const ThActions: React.FC = () => (
  <th className="sticky right-0 z-10 bg-gray-50 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)] h-9 px-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right whitespace-nowrap">Actions</th>
);

export const TdActions: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={cn('sticky right-0 z-10 py-2 px-3 align-top bg-white shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]', className)}>
    <div className="flex items-center justify-end gap-1">{children}</div>
  </td>
);

export const rowKeyHandler = (open: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
};

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <span className="text-gray-500">{label}</span>
    <span className="min-w-0 break-words">{children}</span>
  </>
);

// ──────────────────────────────────────────────────────────────────
// Detail drawer — centered dialog on ≥sm, bottom sheet on phones.
// ──────────────────────────────────────────────────────────────────
export const DetailDrawer: React.FC<{
  eyebrow: string;
  title: string;
  titleExtra?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ eyebrow, title, titleExtra, onClose, children, footer, wide }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useRef(`drawer-${Math.random().toString(36).slice(2, 8)}`).current;

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
        className={cn('w-full mt-auto sm:mt-0 sm:max-h-[92vh] max-h-[90vh] overflow-y-auto shadow-2xl rounded-b-none sm:rounded-lg rounded-t-2xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-2xl')}
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
                {titleExtra && <div className="flex items-center gap-2 mt-1.5 flex-wrap">{titleExtra}</div>}
              </div>
              <Button ref={closeRef} size="sm" variant="ghost" onClick={onClose} className="text-white hover:bg-white/10 h-10 w-10 p-0 flex-shrink-0" aria-label="Close">
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="p-4 sm:p-5 space-y-4">{children}</div>
          {footer && <div className="px-4 sm:px-5 pb-4 text-[10px] text-gray-400">{footer}</div>}
        </CardContent>
      </Card>
    </div>
  );
};
