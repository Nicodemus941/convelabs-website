import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Building2, Calendar, FileText, DollarSign, Users, LogOut, Phone, Mail, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

/**
 * PROVIDER PORTAL DASHBOARD
 *
 * Shown when the logged-in user's role is 'provider' — i.e., they're an
 * external partner org contact (Elite Medical, CAO, Aristotle, etc.).
 *
 * This is intentionally minimal for the first ship. Shows:
 *   - Which org they belong to (loaded from organizations via their email)
 *   - Org's billing mode + patient-pricing + scheduling window
 *   - Placeholder cards for what's coming (Schedule a Visit, My Patients,
 *     Subscription Plans, Billing History) — each links to a scoped page
 *     when it's built.
 *
 * Security: RLS on `organizations` already restricts this read to portal-
 * enabled, active orgs, and the user's session context. If the user isn't
 * a provider (role check passed but email doesn't match any org), we show
 * a friendly "account not linked" error instead of a blank dashboard.
 */

interface OrgData {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_email: string | null;
  default_billed_to: 'patient' | 'org' | null;
  locked_price_cents: number | null;
  org_invoice_price_cents: number | null;
  member_stacking_rule: string | null;
  show_patient_name_on_appointment: boolean | null;
  time_window_rules: any;
  portal_enabled: boolean | null;
}

const ProviderDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('id, name, contact_name, contact_email, contact_phone, billing_email, default_billed_to, locked_price_cents, org_invoice_price_cents, member_stacking_rule, show_patient_name_on_appointment, time_window_rules, portal_enabled')
          .or(`billing_email.eq.${user.email},contact_email.eq.${user.email}`)
          .eq('portal_enabled', true)
          .eq('is_active', true)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          setErr('Your account isn\'t linked to an active provider organization.');
        } else {
          setOrg(data as OrgData);
        }
      } catch (e: any) {
        setErr(e?.message || 'Failed to load your organization');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.email]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/provider');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (err || !org) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-700">We couldn't open your portal</CardTitle>
            <CardDescription>{err}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">If you believe this is a mistake, email <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a> or call (941) 527-9169.</p>
            <Button variant="outline" onClick={handleSignOut} className="w-full">Sign out</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const billingLabel =
    org.default_billed_to === 'org' ? 'Organization pays' :
    org.default_billed_to === 'patient' ? 'Patient pays' :
    'Mixed';

  const patientPrice = org.locked_price_cents != null ? `$${(org.locked_price_cents / 100).toFixed(2)}` : '—';
  const orgInvoicePrice = org.org_invoice_price_cents != null ? `$${(org.org_invoice_price_cents / 100).toFixed(2)}` : '—';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-bold">ConveLabs<span className="text-[#B91C1C]">.</span></span>
            <Badge className="bg-[#B91C1C]/10 text-[#B91C1C] hover:bg-[#B91C1C]/10 text-[10px] uppercase tracking-wider">Provider</Badge>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 hidden sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Welcome */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-[#B91C1C]/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-7 w-7 text-[#B91C1C]" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Welcome back</p>
            <h1 className="text-2xl sm:text-3xl font-bold">{org.name}</h1>
            <p className="text-sm text-gray-600 mt-0.5">
              {org.contact_name && <>{org.contact_name} · </>}
              {org.contact_email} {org.contact_phone && <>· {org.contact_phone}</>}
            </p>
          </div>
        </div>

        {/* Billing + rules overview */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Your partnership rules</CardTitle>
            <CardDescription className="text-xs">Locked in for your org. Invoices route according to these settings.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Default bill-payer</p>
              <p className="font-semibold mt-1">{billingLabel}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Patient price</p>
              <p className="font-semibold mt-1">{patientPrice}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Org invoice price</p>
              <p className="font-semibold mt-1">{orgInvoicePrice}</p>
            </div>
          </CardContent>
        </Card>

        {/* Quick actions — placeholders for now, each will deep-link when built */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-sm hover:shadow-md transition cursor-not-allowed opacity-60">
            <CardContent className="p-5">
              <Calendar className="h-6 w-6 text-[#B91C1C] mb-2" />
              <p className="font-semibold">Schedule a visit</p>
              <p className="text-xs text-gray-500 mt-1">Coming soon</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm hover:shadow-md transition cursor-not-allowed opacity-60">
            <CardContent className="p-5">
              <Users className="h-6 w-6 text-[#B91C1C] mb-2" />
              <p className="font-semibold">My patients</p>
              <p className="text-xs text-gray-500 mt-1">Coming soon</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm hover:shadow-md transition cursor-not-allowed opacity-60">
            <CardContent className="p-5">
              <DollarSign className="h-6 w-6 text-[#B91C1C] mb-2" />
              <p className="font-semibold">Subscription plans</p>
              <p className="text-xs text-gray-500 mt-1">Coming soon</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm hover:shadow-md transition cursor-not-allowed opacity-60">
            <CardContent className="p-5">
              <FileText className="h-6 w-6 text-[#B91C1C] mb-2" />
              <p className="font-semibold">Billing history</p>
              <p className="text-xs text-gray-500 mt-1">Coming soon</p>
            </CardContent>
          </Card>
        </div>

        {/* Contact footer */}
        <Card className="shadow-sm bg-gradient-to-br from-gray-50 to-white border-dashed">
          <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
            <div>
              <p className="font-semibold">Need something we haven't built yet?</p>
              <p className="text-sm text-gray-600 mt-1">Email me directly and I'll get it done.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild className="gap-1">
                <a href="mailto:info@convelabs.com"><Mail className="h-4 w-4" /> info@convelabs.com</a>
              </Button>
              <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" asChild>
                <a href="tel:+19415279169"><Phone className="h-4 w-4" /> (941) 527-9169</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ProviderDashboard;
