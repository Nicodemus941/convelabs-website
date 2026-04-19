import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Loader2 } from 'lucide-react';

/**
 * FoundingSeatsCounter — live scarcity meter for the Founding 50 VIP seats.
 *
 * Hormozi principle: caps feel honest, timers feel gimmicky. The 50-seat
 * limit is enforced server-side in claim_founding_seat(); this component
 * renders the *same* count the webhook will see when the next signup hits.
 *
 * Auto-refreshes every 60s so the counter looks alive without thrashing.
 *
 * Variants:
 *   'full'    — full banner with progress bar + copy (use on /pricing)
 *   'pill'    — compact inline badge, "13 left" (for tight surfaces)
 *   'banner'  — horizontal strip with CTA hint (for dashboards)
 */

interface Status {
  tier: string;
  cap: number;
  claimed: number;
  remaining: number;
  next_number: number;
  is_open: boolean;
  locked_rate_cents: number;
}

interface Props {
  variant?: 'full' | 'pill' | 'banner';
  className?: string;
  onStatusLoaded?: (status: Status) => void;
}

const FoundingSeatsCounter: React.FC<Props> = ({ variant = 'full', className = '', onStatusLoaded }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('get_founding_seats_status' as any, { p_tier: 'vip' });
      if (!mounted) return;
      if (!error && data) {
        setStatus(data as Status);
        onStatusLoaded?.(data as Status);
      }
      setLoading(false);
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { mounted = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !status) {
    if (variant === 'pill') {
      return <span className={`inline-flex items-center gap-1 text-xs text-gray-500 ${className}`}><Loader2 className="h-3 w-3 animate-spin" /></span>;
    }
    return <div className={`h-8 ${className}`} />;
  }

  const pct = Math.min(100, Math.round((status.claimed / status.cap) * 100));
  const closed = !status.is_open || status.remaining === 0;

  // ── pill variant ─────────────────────────────────────────────────
  if (variant === 'pill') {
    if (closed) {
      return (
        <span className={`inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-[11px] font-medium px-2 py-0.5 rounded-full ${className}`}>
          Founding 50 full
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center gap-1 bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full ${className}`}>
        <Sparkles className="h-3 w-3" /> Only {status.remaining} Founding seats left
      </span>
    );
  }

  // ── banner variant ───────────────────────────────────────────────
  if (variant === 'banner') {
    if (closed) return null;
    return (
      <div className={`bg-gradient-to-r from-amber-50 to-rose-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3 ${className}`}>
        <Sparkles className="h-5 w-5 text-amber-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            {status.remaining} Founding VIP seats left
          </p>
          <p className="text-xs text-amber-700">
            First 50 VIP members lock the $199/yr rate for life + free family add-on. {status.claimed}/{status.cap} claimed.
          </p>
        </div>
      </div>
    );
  }

  // ── full variant ─────────────────────────────────────────────────
  return (
    <div className={`bg-gradient-to-br from-amber-50 via-rose-50 to-amber-50 border-2 border-amber-300 rounded-2xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-600" />
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-widest">
            Founding 50 · VIP tier
          </span>
        </div>
        <span className={`text-xs font-semibold ${closed ? 'text-gray-600' : 'text-amber-800'}`}>
          {status.claimed} / {status.cap} claimed
        </span>
      </div>
      <h3 className="text-lg font-bold text-amber-900 mb-1">
        {closed
          ? 'Founding 50 complete — standard VIP still available'
          : status.remaining === 1
            ? 'Last Founding seat — one left'
            : `${status.remaining} Founding VIP seats left`}
      </h3>
      <p className="text-xs text-amber-800 mb-3 leading-relaxed">
        {closed
          ? 'Thanks to the first 50 founders. Standard VIP membership is $199/yr — same feature set, standard rate-lock policy.'
          : 'The first 50 VIP signups lock their $199/yr rate for life, get a free family add-on, and priority same-day booking. When these are gone, they\'re gone.'}
      </p>
      {/* Progress bar */}
      <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-amber-200">
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default FoundingSeatsCounter;
