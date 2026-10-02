/**
 * InboxHero — the shared top band of every Inbox screen.
 *
 * Needs attention, Notes & tasks and Website chat used to open with three
 * unrelated headers (a gradient card, a plain h1 with a scoreboard, a
 * "Ask Nico Chatbot" title). This gives the Inbox one voice in the
 * LabOrdersTab language: #B91C1C title row, a short promise line, and a strip
 * of clickable count tiles. Tiles are the screen's OWN buckets (passed in), so
 * their sum matches the list below them; the cross-screen numbers live on the
 * sub-tab bar above (AdminSectionShell) and are not repeated here.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export interface HeroTile {
  key: string;
  label: string;
  value: number | string;
  /** Visual tone when active / when hot. */
  tone?: 'red' | 'amber' | 'blue' | 'emerald' | 'gray' | 'purple';
  /** Highlight the number when > 0 even if not active. */
  hot?: boolean;
  desc?: string;
}

const TONE: Record<NonNullable<HeroTile['tone']>, string> = {
  red: 'border-red-300 bg-red-50 text-red-800',
  amber: 'border-amber-300 bg-amber-50 text-amber-900',
  blue: 'border-blue-300 bg-blue-50 text-blue-900',
  emerald: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  gray: 'border-gray-300 bg-gray-50 text-gray-700',
  purple: 'border-purple-300 bg-purple-50 text-purple-900',
};

export const InboxHero: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: React.ReactNode;
  tiles: HeroTile[];
  activeKey?: string | null;
  onTile?: (key: string) => void;
  loading?: boolean;
  onRefresh?: () => void;
  actions?: React.ReactNode;
  /** Number of columns at sm+. Defaults to tiles.length (max 6). */
  cols?: number;
}> = ({ icon: Icon, title, subtitle, tiles, activeKey, onTile, loading, onRefresh, actions, cols }) => {
  const n = Math.min(6, Math.max(2, cols || tiles.length));
  const colClass = ['', '', 'sm:grid-cols-2', 'sm:grid-cols-3', 'sm:grid-cols-4', 'sm:grid-cols-5', 'sm:grid-cols-6'][n];
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-[#B91C1C]" aria-hidden="true" />
            {title}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {actions}
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} aria-label="Refresh"
              className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          )}
        </div>
      </div>

      <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible snap-x">
        <div className={cn('grid grid-flow-col auto-cols-[46%] sm:auto-cols-auto sm:grid-flow-row gap-2', colClass)} role="group" aria-label={`${title} counts`}>
          {tiles.map(t => {
            const active = activeKey === t.key;
            const tone = t.tone || 'gray';
            const clickable = !!onTile;
            const Comp: any = clickable ? 'button' : 'div';
            const hot = t.hot && typeof t.value === 'number' && t.value > 0;
            return (
              <Comp
                key={t.key}
                {...(clickable ? { type: 'button', onClick: () => onTile!(t.key), 'aria-pressed': active } : {})}
                title={t.desc}
                className={cn(
                  'text-left rounded-lg border px-3 py-2.5 min-h-[64px] snap-start transition shadow-sm',
                  clickable && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                  active ? cn('ring-2 ring-[#B91C1C]/30', TONE[tone]) : cn('bg-white border-gray-200', clickable && 'hover:border-[#B91C1C]/40'),
                )}
              >
                <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 truncate">{t.label}</p>
                <p className={cn('text-2xl font-bold leading-tight mt-0.5 tabular-nums', hot && !active && 'text-red-700')}>
                  {loading ? '–' : t.value}
                </p>
              </Comp>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** Filter chip row — same shape as LabOrdersTab's status chips. */
export const ChipRow: React.FC<{
  chips: Array<{ key: string; label: string; count?: number; dot?: string; desc?: string }>;
  active: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
}> = ({ chips, active, onChange, ariaLabel }) => (
  <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:flex-wrap" role="group" aria-label={ariaLabel || 'Filter'}>
    {chips.map(c => {
      const isActive = active === c.key;
      return (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          aria-pressed={isActive}
          title={c.desc}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
            isActive ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
            !isActive && c.count === 0 && 'text-gray-400',
          )}
        >
          {c.dot && <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-white' : c.dot)} aria-hidden="true" />}
          {c.label}
          {typeof c.count === 'number' && <span className={cn('tabular-nums', isActive ? 'opacity-90' : 'text-gray-500')}>{c.count}</span>}
        </button>
      );
    })}
  </div>
);

/** Lane header — "Needs action" / "Everything else". */
export const LaneHeader: React.FC<{ id: string; title: string; count: number; tone: 'red' | 'gray' | 'emerald' | 'blue'; hint?: string }> = ({ id, title, count, tone, hint }) => (
  <div className="flex items-center gap-2 mb-2">
    <span className={cn('w-2 h-2 rounded-full', tone === 'red' ? 'bg-red-500' : tone === 'emerald' ? 'bg-emerald-500' : tone === 'blue' ? 'bg-blue-500' : 'bg-gray-300')} aria-hidden="true" />
    <h2 id={id} className={cn('text-xs font-bold uppercase tracking-wider', tone === 'red' ? 'text-red-800' : 'text-gray-600')}>
      {title} <span className="font-semibold text-gray-400 tabular-nums">· {count}</span>
    </h2>
    {hint && <span className="text-[11px] text-gray-400 hidden sm:inline">— {hint}</span>}
  </div>
);

/** Aging pill shared by every queue. */
export const AgingPill: React.FC<{ iso: string | null | undefined; label?: string }> = ({ iso, label }) => {
  if (!iso) return null;
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days >= 5) return <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 text-[10px] font-semibold">Stale {days}d</span>;
  if (days >= 3) return <span className="inline-flex items-center rounded-full bg-orange-100 text-orange-800 border border-orange-200 px-2 py-0.5 text-[10px] font-semibold">Aging {days}d</span>;
  return label ? <span className="inline-flex items-center rounded-full bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 text-[10px]">{label}</span> : null;
};
