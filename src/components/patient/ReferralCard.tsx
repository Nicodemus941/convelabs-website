import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Gift, Copy, Share2, Users, DollarSign, CheckCircle, MessageSquare, Trophy } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

const ReferralCard: React.FC = () => {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [uses, setUses] = useState(0);
  const [creditBalance, setCreditBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Find referral code (try auth ID, then tenant_patients ID)
      let data: any = null;
      const { data: d1 } = await supabase.from('referral_codes' as any).select('*').eq('user_id', user.id).maybeSingle();
      data = d1;

      if (!data && user.email) {
        const { data: tp } = await supabase.from('tenant_patients').select('id').ilike('email', user.email).maybeSingle();
        if (tp) {
          const { data: d2 } = await supabase.from('referral_codes' as any).select('*').eq('user_id', tp.id).maybeSingle();
          data = d2;
        }
      }

      if (data) {
        setCode(data.code);
        setUses(data.uses || 0);
      }

      // Get credit balance
      const userId = data?.user_id || user.id;
      const { data: credits } = await supabase.from('referral_credits' as any)
        .select('amount, redeemed')
        .eq('user_id', userId);

      if (credits) {
        const balance = credits.filter((c: any) => !c.redeemed).reduce((s: number, c: any) => s + (c.amount || 0), 0);
        setCreditBalance(balance);
      }

      setLoading(false);
    };
    load();
  }, [user?.id]);

  if (loading) return null;

  // No code yet — show teaser
  if (!code) {
    return (
      <Card className="shadow-sm bg-gradient-to-br from-[#B91C1C]/5 to-amber-50/50 border-[#B91C1C]/10">
        <CardContent className="p-4 text-center">
          <Gift className="h-8 w-8 text-[#B91C1C] mx-auto mb-2" />
          <p className="font-bold text-sm">Refer a Friend, Both Get $25</p>
          <p className="text-xs text-muted-foreground mt-1">Complete your first visit to unlock your referral code and start earning credits toward a free visit.</p>
        </CardContent>
      </Card>
    );
  }

  const referralLink = `https://convelabs.com/book-now?ref=${code}`;
  const shareMessage = `Hey! I use ConveLabs for at-home blood work — they come to your door. Use my code ${code} for $25 off your first visit: ${referralLink}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).then(() => toast.success('Link copied!')).catch(() => {
      // Fallback for mobile
      const input = document.createElement('input');
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      toast.success('Link copied!');
    });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'ConveLabs — $25 Off Your First Visit', text: shareMessage, url: referralLink });
      } catch { handleCopy(); }
    } else { handleCopy(); }
  };

  const handleSMS = () => {
    const encoded = encodeURIComponent(shareMessage);
    // iOS uses &body=, Android uses ?body=
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    window.open(isIOS ? `sms:&body=${encoded}` : `sms:?body=${encoded}`);
  };

  const FREE_VISIT_THRESHOLD = 125; // 5 referrals × $25 = $125

  const handleClaimFreeVisit = async () => {
    if (creditBalance < FREE_VISIT_THRESHOLD) {
      toast.error(`You need $${FREE_VISIT_THRESHOLD} in credits. You have $${creditBalance}.`);
      return;
    }
    toast.success('Your free visit credit has been applied! Book your next appointment — it\'s on us. 🎉');
    const userId = user?.id;
    if (userId) {
      let remaining = FREE_VISIT_THRESHOLD;
      const { data: credits } = await supabase.from('referral_credits' as any)
        .select('id, amount').eq('user_id', userId).eq('redeemed', false).order('created_at');
      for (const credit of (credits || [])) {
        if (remaining <= 0) break;
        await supabase.from('referral_credits' as any).update({ redeemed: true, redeemed_at: new Date().toISOString() }).eq('id', credit.id);
        remaining -= credit.amount;
      }
      setCreditBalance(Math.max(creditBalance - FREE_VISIT_THRESHOLD, 0));
    }
  };

  const freeVisitProgress = Math.min(uses, 5);
  const canClaimFreeVisit = creditBalance >= FREE_VISIT_THRESHOLD;

  return (
    <Card className="shadow-sm border-[#B91C1C]/15 bg-gradient-to-br from-[#B91C1C]/5 to-amber-50/30 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#B91C1C]/10 flex items-center justify-center">
              <Gift className="h-4 w-4 text-[#B91C1C]" />
            </div>
            <div>
              <p className="font-bold text-sm">Refer & Earn</p>
              <p className="text-[10px] text-muted-foreground">Give $25, Get $25</p>
            </div>
          </div>
          {creditBalance > 0 && (
            <div className="text-right">
              <p className="text-lg font-bold text-[#B91C1C]">${creditBalance}</p>
              <p className="text-[10px] text-muted-foreground">credit balance</p>
            </div>
          )}
        </div>

        {/* Code display */}
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white border rounded-lg px-3 py-2 text-center">
            <p className="font-mono font-bold text-[#B91C1C] tracking-wider">{code}</p>
          </div>
          <Button size="icon" variant="outline" onClick={handleCopy} className="h-10 w-10 flex-shrink-0" title="Copy link">
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        {/* Share buttons */}
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 text-xs" onClick={handleShare}>
            <Share2 className="h-3.5 w-3.5" /> Share
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleSMS}>
            <MessageSquare className="h-3.5 w-3.5" /> Text
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
        </div>

        {/* Progress to free visit */}
        <div className="pt-2 border-t space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Trophy className="h-3 w-3" /> {freeVisitProgress}/5 referrals
            </span>
            <span className={`font-semibold ${freeVisitProgress >= 5 ? 'text-[#B91C1C]' : 'text-muted-foreground'}`}>
              {freeVisitProgress >= 5 ? '🎉 FREE visit earned!' : `${5 - freeVisitProgress} more to go`}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div className="bg-gradient-to-r from-[#B91C1C] to-amber-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${(freeVisitProgress / 5) * 100}%` }} />
          </div>

          {/* Milestones */}
          <div className="flex justify-between text-[9px] text-muted-foreground px-1">
            <span className={uses >= 1 ? 'text-green-600 font-medium' : ''}>1 = $25</span>
            <span className={uses >= 3 ? 'text-green-600 font-medium' : ''}>3 = $75</span>
            <span className={uses >= 5 ? 'text-[#B91C1C] font-bold' : ''}>5 = FREE</span>
          </div>
        </div>

        {/* Claim free visit */}
        {canClaimFreeVisit && (
          <Button className="w-full bg-gradient-to-r from-amber-500 to-[#B91C1C] text-white rounded-xl font-bold shadow-md" onClick={handleClaimFreeVisit}>
            <Trophy className="h-4 w-4 mr-2" /> Claim Your Free Visit
          </Button>
        )}

        {/* Stats */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {uses} referred</span>
          <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> ${uses * 25} earned</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReferralCard;
