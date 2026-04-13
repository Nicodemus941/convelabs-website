import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Gift, Copy, Share2, Users, DollarSign } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

const ReferralCard: React.FC = () => {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [uses, setUses] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Try by auth user ID first
      let { data } = await supabase.from('referral_codes' as any).select('*').eq('user_id', user.id).maybeSingle();

      // Fallback: find via tenant_patients
      if (!data && user.email) {
        const { data: tp } = await supabase.from('tenant_patients').select('id').ilike('email', user.email).maybeSingle();
        if (tp) {
          const { data: byTp } = await supabase.from('referral_codes' as any).select('*').eq('user_id', tp.id).maybeSingle();
          if (byTp) data = byTp;
        }
      }

      if (data) {
        setCode((data as any).code);
        setUses((data as any).uses || 0);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return null;

  if (!code) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-4 text-center">
          <Gift className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-600">Refer & Earn $25</p>
          <p className="text-xs text-muted-foreground mt-1">Complete your first appointment to unlock your personal referral code and start earning credits.</p>
        </CardContent>
      </Card>
    );
  }

  const referralLink = `https://convelabs.com/book-now?ref=${code}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success('Referral link copied!');
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'ConveLabs - $25 Off Your First Visit',
        text: `Use my referral code ${code} to get $25 off your first ConveLabs blood draw! Book at:`,
        url: referralLink,
      });
    } else {
      handleCopy();
    }
  };

  const handleSMS = () => {
    const msg = encodeURIComponent(`Hey! I use ConveLabs for my blood work - they come to your home. Use my code ${code} for $25 off: ${referralLink}`);
    window.open(`sms:?body=${msg}`);
  };

  return (
    <Card className="shadow-sm border-[#B91C1C]/20 bg-gradient-to-br from-red-50/50 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gift className="h-4 w-4 text-[#B91C1C]" />
          Refer & Earn $25
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Share ConveLabs with friends. You both get $25 off.</p>

        <div className="flex items-center gap-2">
          <Input value={code} readOnly className="font-mono font-bold text-center text-[#B91C1C] bg-white" />
          <Button size="icon" variant="outline" onClick={handleCopy} title="Copy code">
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" onClick={handleShare}>
            <Share2 className="h-3.5 w-3.5" /> Share
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={handleSMS}>
            Text a Friend
          </Button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {uses} friend{uses !== 1 ? 's' : ''} referred</span>
          <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> ${uses * 25} earned</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReferralCard;
