import React, { useEffect, useState } from 'react';
import { Award, Lock, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * FoundingMemberBadge — shown on the patient dashboard for users who
 * successfully claimed one of the 50 Founding VIP seats.
 *
 * Pulls founding_member_number + founding_locked_rate_cents from their
 * user_memberships row. No-ops (renders nothing) for non-founding members.
 */

interface Props {
  className?: string;
  compact?: boolean;
}

interface MembershipRow {
  founding_member_number: number | null;
  founding_locked_rate_cents: number | null;
  founding_member_signup_date: string | null;
}

const FoundingMemberBadge: React.FC<Props> = ({ className = '', compact = false }) => {
  const { user } = useAuth();
  const [row, setRow] = useState<MembershipRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('user_memberships')
        .select('founding_member_number, founding_locked_rate_cents, founding_member_signup_date')
        .eq('user_id', user.id)
        .not('founding_member_number', 'is', null)
        .order('founding_member_number', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (mounted) {
        setRow((data as any) || null);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [user?.id]);

  if (loading) return compact ? null : <div className={`h-8 ${className}`}><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>;
  if (!row || !row.founding_member_number) return null;

  const rateDollars = row.founding_locked_rate_cents ? row.founding_locked_rate_cents / 100 : 199;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 bg-gradient-to-r from-amber-100 to-rose-100 border border-amber-400 text-amber-900 text-[11px] font-bold px-2 py-0.5 rounded-full ${className}`}>
        <Award className="h-3 w-3" /> Founding #{row.founding_member_number}
      </span>
    );
  }

  return (
    <div className={`bg-gradient-to-br from-amber-50 via-rose-50 to-amber-50 border-2 border-amber-400 rounded-2xl p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center flex-shrink-0 shadow-md">
          <Award className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest">
            Founding Member
          </p>
          <p className="text-lg font-bold text-amber-900 leading-tight">
            You're #{row.founding_member_number} of 50
          </p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-800">
            <Lock className="h-3 w-3" />
            <span>
              ${rateDollars.toFixed(0)}/yr rate locked for life
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FoundingMemberBadge;
