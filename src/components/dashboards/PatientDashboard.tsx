import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, User, ArrowRight, Plus, Star, FileText, Bell, MessageSquare, Mail, Phone, LogOut, Check, Crown, Loader2, Shield, AlertTriangle, ChevronRight, Gift, Activity } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import UpcomingAppointments from "@/components/appointments/UpcomingAppointments";
import AppointmentHistory from "@/components/appointments/AppointmentHistory";
import ReferralCard from "@/components/patient/ReferralCard";
import MyRecurringPlans from "@/components/patient/MyRecurringPlans";
import MemberSavingsBanner from "@/components/patient/MemberSavingsBanner";
import PatientBenefitsCard from "@/components/dashboards/patient/PatientBenefitsCard";

const PLANS = [
  { name: 'Member', price: 99, color: 'border-blue-200', badge: '', mobile: '$130', save: '$20', features: ['Mobile visits: $130 (save $20)', 'Weekend appointments', 'Patient portal'] },
  { name: 'VIP', price: 199, color: 'border-[#B91C1C]', badge: 'Most Popular', mobile: '$115', save: '$35', features: ['Mobile visits: $115 (save $35)', 'Priority same-day', 'Family add-ons $45', 'Extended hours'] },
  { name: 'Concierge', price: 399, color: 'border-amber-400', badge: 'Best Value', mobile: '$99', save: '$51', features: ['Mobile visits: $99 (save $51)', 'Dedicated phlebotomist', 'Same-day guaranteed', 'NDA available', 'Concierge support'] },
];

const PatientDashboard = () => {
  const { user, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const [stats, setStats] = useState({ upcoming: 0, completed: 0, pastVisits: 0, nextDate: '', nextTime: '', daysSince: 0, totalSpent: 0, avgFrequency: 0 });
  const [notifMethod, setNotifMethod] = useState<'sms' | 'email' | 'both'>('both');
  const [notifSaving, setNotifSaving] = useState(false);
  const [membershipModalOpen, setMembershipModalOpen] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  // Founding-50 scarcity status — populated from get_founding_seats_status('vip')
  // RPC. When fewer than 50 VIP founding seats have been claimed, the upgrade
  // modal shows a real-time scarcity banner + the stacked-value card on the
  // VIP tile. Once cap is reached, both elements gracefully disappear and the
  // standard tile renders.
  const [foundingStatus, setFoundingStatus] = useState<{ tier: string; cap: number; claimed: number; remaining: number; next_number: number; is_open: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_founding_seats_status' as any, { tier: 'vip' });
        if (!cancelled && data) setFoundingStatus(data as any);
      } catch { /* non-blocking — modal still renders without scarcity */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (searchParams.get('membership') === 'success') {
      toast.success('Welcome to ConveLabs Membership! 🎉 Your discounts are now active.');
      window.history.replaceState({}, '', '/dashboard/patient');
    }
  }, []);

  const handleSubscribe = async (planName: string) => {
    if (!user) return;
    setSubscribing(planName);
    try {
      const prices: Record<string, number> = { Member: 99, VIP: 199, Concierge: 399 };
      const { data, error } = await supabase.functions.invoke('create-appointment-checkout', {
        body: {
          serviceType: 'membership', serviceName: `ConveLabs ${planName} Membership (Annual)`,
          amount: (prices[planName] || 99) * 100, tipAmount: 0,
          appointmentDate: new Date().toISOString().split('T')[0], appointmentTime: '',
          patientDetails: { firstName: user.firstName || '', lastName: user.lastName || '', email: user.email || '' },
          locationDetails: { address: '', city: '', state: 'FL', zipCode: '' },
          serviceDetails: { additionalNotes: `Membership: ${planName} Annual` },
        },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err: any) { toast.error(err.message || 'Failed to start checkout'); }
    finally { setSubscribing(null); }
  };

  useEffect(() => {
    if (!user) return;
    const loadStats = async () => {
      let all: any[] = [];
      const { data: byId } = await supabase.from('appointments').select('id, status, appointment_date, appointment_time, total_amount, payment_status, lab_order_file_path, view_token')
        .eq('patient_id', user.id);
      if (byId) all = [...byId];
      if (user.email) {
        const { data: byEmail } = await supabase.from('appointments').select('id, status, appointment_date, appointment_time, total_amount, payment_status, lab_order_file_path, view_token')
          .ilike('patient_email', user.email);
        if (byEmail) { const ids = new Set(all.map(a => a.id)); all = [...all, ...(byEmail.filter(a => !ids.has(a.id)))]; }
      }
      const upcoming = all.filter(a => ['scheduled', 'confirmed'].includes(a.status)).sort((a, b) => new Date(a.appointment_date || 0).getTime() - new Date(b.appointment_date || 0).getTime());
      const completed = all.filter(a => a.status === 'completed').sort((a, b) => new Date(b.appointment_date || 0).getTime() - new Date(a.appointment_date || 0).getTime());
      // Past Visits count = anything AppointmentHistory shows (completed +
      // specimen_delivered + cancelled). Previously this header rendered
      // `${stats.completed} total` which only counted status=completed, so
      // a patient with 1 completed + 1 cancelled visit saw "1 total" above
      // a list of 2 rows. (Bug #11 in nicq E2E.)
      const pastVisitsCount = all.filter(a => ['completed', 'specimen_delivered', 'cancelled'].includes(a.status)).length;
      const next = upcoming[0];
      // TZ-safe display: appointment_date comes back as 'YYYY-MM-DD...' from Postgres.
      // Naive `new Date(str)` parses the ISO timestamp in UTC, then renders local —
      // for a US-East user that shifts a 2026-05-21T00:00:00+00 row to "May 20".
      // Fix: extract the YYYY-MM-DD portion and pin to noon local before formatting,
      // so the displayed day matches the stored calendar day. (Bug #7 in nicq E2E.)
      const isoDay = (next?.appointment_date || '').substring(0, 10);
      const nextDate = isoDay
        ? new Date(`${isoDay}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : '';
      // Time display normalization: appointment_time comes back as 'HH:MM:SS'
      // from Postgres TIME column. Hero card was rendering it raw ("09:00:00")
      // which felt military / unfriendly. Convert to "9:00 AM" so the patient
      // sees what they'd expect to read aloud. (nicq E2E 2026-05-17.)
      const rawTime = String(next?.appointment_time || '');
      const nextTime = (() => {
        if (!rawTime) return '';
        if (rawTime.toUpperCase().includes('AM') || rawTime.toUpperCase().includes('PM')) return rawTime;
        const [h, m] = rawTime.split(':').map(Number);
        if (Number.isNaN(h)) return rawTime;
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
        return `${h12}:${String(m || 0).padStart(2, '0')} ${period}`;
      })();
      // Lab-order readiness for the hero card "Have your lab order ready"
      // copy. nicq E2E 2026-05-17 confirmed Valli's complaint: the static
      // copy persisted even after a successful upload — we now flip it to
      // a confirmation chip when the appointment row already has a path.
      const nextHasLabOrder = Boolean(next?.lab_order_file_path);
      const lastCompleted = completed[0];
      const daysSince = lastCompleted?.appointment_date ? Math.floor((Date.now() - new Date(lastCompleted.appointment_date).getTime()) / 86400000) : 0;
      const totalSpent = all.filter(a => a.payment_status === 'completed').reduce((s: number, a: any) => s + (a.total_amount || 0), 0);
      // Average days between visits
      let avgFrequency = 0;
      if (completed.length >= 2) {
        const dates = completed.map(a => new Date(a.appointment_date).getTime()).sort();
        const gaps = [];
        for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i-1]) / 86400000);
        avgFrequency = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
      }
      setStats({ upcoming: upcoming.length, completed: completed.length, pastVisits: pastVisitsCount, nextDate, nextTime, nextHasLabOrder, nextToken: next?.view_token || '', daysSince, totalSpent, avgFrequency } as any);
    };
    loadStats();
    supabase.from('email_preferences').select('notification_method').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.notification_method) setNotifMethod(data.notification_method as any); });
  }, [user?.id]);

  const handleNotifChange = async (method: 'sms' | 'email' | 'both') => {
    if (!user) return;
    setNotifSaving(true); setNotifMethod(method);
    await supabase.from('email_preferences').upsert({ user_id: user.id, notification_method: method, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    setNotifSaving(false);
    toast.success(`Notifications: ${method === 'both' ? 'SMS & Email' : method.toUpperCase()}`);
  };

  // Determine the primary action card content
  const isOverdue = stats.daysSince > 90 && stats.completed > 0;
  const hasUpcoming = stats.upcoming > 0;
  const isNewPatient = stats.completed === 0 && stats.upcoming === 0;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 pb-24 md:pb-8">

      {/* P5 — Member savings trophy. Only renders for active members with
          at least one paid visit; silent for non-members + first-time members.
          Placed above the hero action so loyalty lands before the next CTA. */}
      <MemberSavingsBanner />

      {/* ===== HERO ACTION CARD — The #1 thing the patient should do ===== */}
      {isOverdue && !hasUpcoming ? (
        // OVERDUE: Urgent rebooking
        <div className="bg-gradient-to-r from-red-600 to-[#B91C1C] text-white rounded-2xl p-5 sm:p-6 mb-6 shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm font-medium opacity-90">Health Reminder</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold">It's been {stats.daysSince} days since your last blood work</h2>
              <p className="text-sm opacity-80 mt-1">Most doctors recommend testing every 90 days. Stay ahead of your health.</p>
            </div>
            <Button size="lg" className="bg-white text-[#B91C1C] hover:bg-gray-100 font-bold rounded-xl shadow-md flex-shrink-0" asChild>
              <Link to="/book-now">Book Now <ArrowRight className="ml-2 h-5 w-5" /></Link>
            </Button>
          </div>
        </div>
      ) : hasUpcoming ? (
        // UPCOMING: luxe concierge treatment — deep oxblood + gold accents
        <div className="relative overflow-hidden bg-gradient-to-br from-[#7f1d1d] via-[#5e1414] to-[#3f0d0d] text-white rounded-2xl p-5 sm:p-7 mb-6 shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#e9d8a6] mb-2">Your Next Visit</p>
              <h2 className="font-serif text-2xl sm:text-3xl flex items-baseline gap-3 flex-wrap">
                {stats.nextDate}
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 0 4px rgba(52,211,153,.25)' }} />
                  Confirmed
                </span>
              </h2>
              {stats.nextTime && <p className="text-lg text-amber-50/90 mt-1">{stats.nextTime}</p>}
              {/*
               * Dynamic readiness copy — was a static "Have your lab order and
               * insurance card ready" that didn't change after the patient
               * actually uploaded their lab order. Trust gap: patient finishes
               * the upload flow, returns to dashboard, sees the same
               * "you still need to" copy and wonders if it landed. (Valli &
               * John Ritenour 2026-05-17.) Now: when lab order is on file we
               * confirm it; otherwise we still nudge.
               */}
              <div className="h-px bg-white/15 my-4" />
              <p className="text-sm text-white/80">
                {(stats as any).nextHasLabOrder
                  ? <span className="text-emerald-200">✓ Lab order on file. Bring your insurance card — your lab (Quest, LabCorp, AdventHealth) bills it directly, not us.</span>
                  : <>Have your lab order + insurance card ready. The lab bills your insurance directly.</>
                }
              </p>
              <span className="inline-flex items-center gap-2 mt-4 text-xs font-semibold rounded-lg border border-[#c9a24b]/50 bg-[#c9a24b]/15 px-3 py-1.5">
                <Shield className="h-3.5 w-3.5 text-[#e9d8a6]" /> On-time, or this visit is on us.
              </span>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {(stats as any).nextToken && (
                <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 rounded-xl" asChild>
                  <Link to={`/appt/${(stats as any).nextToken}/confirm`}>Reschedule</Link>
                </Button>
              )}
              <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 rounded-xl" asChild>
                <Link to="/profile">My Profile</Link>
              </Button>
              <Button className="bg-white text-[#7f1d1d] hover:bg-amber-50 font-semibold rounded-xl" asChild>
                <Link to="/book-now">Book Another</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : isNewPatient ? (
        // NEW PATIENT: Welcome + first booking
        <div className="bg-gradient-to-r from-[#B91C1C] to-[#991B1B] text-white rounded-2xl p-5 sm:p-6 mb-6 shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">Welcome to ConveLabs, {user?.firstName || 'there'}!</h2>
              <p className="text-sm opacity-90 mt-1">Book your first visit — a licensed phlebotomist at your door in 60 minutes.</p>
              <p className="text-xs opacity-70 mt-2">🛡️ On-time guarantee — or your visit is free.</p>
            </div>
            <Button size="lg" className="bg-white text-[#B91C1C] hover:bg-gray-100 font-bold rounded-xl shadow-md flex-shrink-0" asChild>
              <Link to="/book-now">Book Your First Visit <ArrowRight className="ml-2 h-5 w-5" /></Link>
            </Button>
          </div>
        </div>
      ) : (
        // DEFAULT: Healthy patient
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-2xl p-5 sm:p-6 mb-6 shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-5 w-5" />
                <span className="text-sm font-medium opacity-90">You're on track</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold">Last tested {stats.daysSince} days ago</h2>
              {stats.avgFrequency > 0 && <p className="text-sm opacity-80 mt-1">You test every ~{stats.avgFrequency} days on average. Keep it up!</p>}
            </div>
            <Button size="lg" className="bg-white text-emerald-700 hover:bg-gray-100 font-bold rounded-xl shadow-md flex-shrink-0" asChild>
              <Link to="/book-now">Schedule Next Visit <ArrowRight className="ml-2 h-5 w-5" /></Link>
            </Button>
          </div>
        </div>
      )}

      {/* ===== TWO BUTTONS: Primary + Secondary ===== */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Button className="h-14 bg-[#B91C1C] hover:bg-[#991B1B] text-white rounded-xl font-semibold text-sm shadow-md" asChild>
          <Link to="/book-now"><Calendar className="h-5 w-5 mr-2" /> Book Appointment</Link>
        </Button>
        <Button variant="outline" className="h-14 rounded-xl font-semibold text-sm border-2" onClick={() => setMembershipModalOpen(true)}>
          <Crown className="h-5 w-5 mr-2 text-amber-500" /> {stats.totalSpent > 0 ? `Save $${Math.round(stats.totalSpent * 0.13)}` : 'Upgrade & Save'}
        </Button>
      </div>

      {/* ===== MEMBER BENEFITS — auto-hides for non-members ===== */}
      <PatientBenefitsCard />

      {/* ===== REFERRAL CARD — Above the fold ===== */}
      <div className="mb-6">
        <ReferralCard />
      </div>

      {/* ===== MY RECURRING PLANS (only renders if patient has any) ===== */}
      <div className="mb-6">
        <MyRecurringPlans />
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Upcoming */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold">Upcoming Appointments</CardTitle>
                <Button variant="ghost" size="sm" className="text-xs text-[#B91C1C]" asChild>
                  <Link to="/book-now">Book New <ChevronRight className="ml-0.5 h-3 w-3" /></Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <UpcomingAppointments />
            </CardContent>
          </Card>

          {/* Past */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold">Past Visits</CardTitle>
                {stats.pastVisits > 0 && (
                  <span className="text-xs text-muted-foreground">{stats.pastVisits} total</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <AppointmentHistory />
            </CardContent>
          </Card>
        </div>

        {/* ===== SIDEBAR (desktop) ===== */}
        <div className="hidden lg:block space-y-5">
          {/* Profile */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[#B91C1C]/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-[#B91C1C]" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link to="/profile">Edit Profile <ChevronRight className="ml-1 h-3 w-3" /></Link>
              </Button>
            </CardContent>
          </Card>

          {/* Health Summary */}
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-3">
              <p className="font-semibold text-sm flex items-center gap-1.5"><Activity className="h-4 w-4 text-[#B91C1C]" /> Health Summary</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total visits</span>
                  <span className="font-medium">{stats.completed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last tested</span>
                  <span className={`font-medium ${stats.daysSince > 90 ? 'text-red-600' : 'text-green-600'}`}>
                    {stats.daysSince > 0 ? `${stats.daysSince}d ago` : stats.completed > 0 ? 'Recent' : 'Never'}
                  </span>
                </div>
                {stats.avgFrequency > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg. frequency</span>
                    <span className="font-medium">Every {stats.avgFrequency}d</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total invested</span>
                  <span className="font-medium">${stats.totalSpent}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <p className="font-semibold text-sm mb-2 flex items-center gap-1.5"><Bell className="h-4 w-4" /> Reminders</p>
              <div className="flex gap-1.5">
                {(['sms', 'email', 'both'] as const).map(method => (
                  <Button key={method} size="sm" variant={notifMethod === method ? 'default' : 'outline'}
                    className={`flex-1 text-xs ${notifMethod === method ? 'bg-[#B91C1C] hover:bg-[#991B1B]' : ''}`}
                    onClick={() => handleNotifChange(method)} disabled={notifSaving}>
                    {method === 'sms' ? 'SMS' : method === 'email' ? 'Email' : 'Both'}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-1.5">
              <Button variant="ghost" size="sm" className="w-full justify-between text-sm h-9" asChild>
                <Link to="/profile"><span className="flex items-center gap-2"><User className="h-4 w-4" /> My Profile</span><ChevronRight className="h-4 w-4" /></Link>
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-between text-sm h-9" asChild>
                <a href="tel:9415279169"><span className="flex items-center gap-2"><Phone className="h-4 w-4" /> Call ConveLabs</span><ChevronRight className="h-4 w-4" /></a>
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-between text-sm h-9 text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={async () => { try { await logout(); } catch { window.location.href = '/login'; } }}>
                <span className="flex items-center gap-2"><LogOut className="h-4 w-4" /> Sign Out</span><ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== MOBILE: Notification + Sign Out (below content) ===== */}
      <div className="lg:hidden space-y-4 mt-6">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Bell className="h-4 w-4" /> Reminders</p>
            <div className="flex gap-2">
              {(['sms', 'email', 'both'] as const).map(method => (
                <Button key={method} size="sm" variant={notifMethod === method ? 'default' : 'outline'}
                  className={`flex-1 text-xs ${notifMethod === method ? 'bg-[#B91C1C] hover:bg-[#991B1B]' : ''}`}
                  onClick={() => handleNotifChange(method)} disabled={notifSaving}>
                  {method === 'sms' ? 'SMS' : method === 'email' ? 'Email' : 'Both'}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" size="sm" className="flex-1 h-11" asChild>
            <Link to="/profile"><User className="h-4 w-4 mr-1" /> Profile</Link>
          </Button>
          <Button variant="outline" size="sm" className="flex-1 h-11" asChild>
            <a href="tel:9415279169"><Phone className="h-4 w-4 mr-1" /> Call Us</a>
          </Button>
          <Button variant="outline" size="sm" className="flex-1 h-11 border-red-200 text-red-600"
            onClick={async () => { try { await logout(); } catch { window.location.href = '/login'; } }}>
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </Button>
        </div>
      </div>

      {/* ===== MEMBERSHIP MODAL ===== */}
      <Dialog open={membershipModalOpen} onOpenChange={setMembershipModalOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-center">
              <Crown className="h-8 w-8 text-amber-500 mx-auto mb-2" />
              <span className="text-xl font-bold">Upgrade Your Experience</span>
              {stats.totalSpent > 0 && (
                <p className="text-sm font-normal text-amber-700 mt-1">
                  You've spent ${stats.totalSpent} this year. As a member, you'd have saved ${Math.round(stats.totalSpent * 0.13)}-${Math.round(stats.totalSpent * 0.34)}.
                </p>
              )}
            </DialogTitle>
          </DialogHeader>
          {/* Founding-50 scarcity banner — Hormozi $100M Offers chapter 2.
              Real-time count of remaining founding VIP seats (RPC, capped at
              50). When seats remain, displays a finite-resource scarcity hook
              that beats every countdown timer because the constraint is
              actually enforced server-side. */}
          {foundingStatus && foundingStatus.is_open && (
            <div className="mt-3 mx-auto max-w-md bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-300 rounded-xl px-4 py-2.5 text-center">
              <p className="text-xs font-bold text-amber-900">
                🔥 Founding VIP · <span className="tabular-nums">{foundingStatus.claimed}</span> of <span className="tabular-nums">{foundingStatus.cap}</span> claimed · <span className="tabular-nums">{foundingStatus.remaining}</span> seats left
              </p>
              <p className="text-[10px] text-amber-800 mt-0.5">Rate locked for life · 1 free family member every visit</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {PLANS.map(plan => (
              <div key={plan.name} className={`border-2 ${plan.color} rounded-xl p-4 relative ${plan.badge ? 'ring-1 ring-[#B91C1C]/20' : ''}`}>
                {plan.badge && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#B91C1C] text-white text-[10px] font-bold px-3 py-0.5 rounded-full">{plan.badge}</div>}
                <h3 className="font-bold text-lg">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1"><span className="text-2xl font-bold">${plan.price}</span><span className="text-xs text-muted-foreground">/year</span></div>
                <div className="bg-green-50 text-green-700 text-xs font-semibold px-2 py-1 rounded-full inline-block mt-2">Mobile from {plan.mobile}</div>
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map(f => (<li key={f} className="flex items-start gap-1.5 text-xs"><Check className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" /><span>{f}</span></li>))}
                </ul>
                {/* Stacked value card — only on VIP (the Most Popular anchor).
                    Hormozi Grand Slam: show what each bonus is worth, sum it,
                    contrast with the price. Math taken from master plan K1
                    so a future buyer/founder can audit the line items. */}
                {plan.name === 'VIP' && foundingStatus?.is_open && (
                  <div className="mt-3 pt-3 border-t border-dashed border-[#B91C1C]/30">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#B91C1C] mb-1.5">Founding Stack</p>
                    <div className="space-y-0.5 text-[11px]">
                      <div className="flex justify-between"><span className="text-gray-600">12 mo VIP membership</span><span className="font-medium tabular-nums">$199</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Rate locked for life</span><span className="font-medium tabular-nums text-green-700">+$50</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">1 free family / visit</span><span className="font-medium tabular-nums text-green-700">+$75</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Priority same-day</span><span className="font-medium tabular-nums text-green-700">+$150</span></div>
                      <div className="flex justify-between pt-1.5 border-t mt-1.5">
                        <span className="font-bold">Stacked value</span>
                        <span className="font-bold tabular-nums">$474</span>
                      </div>
                      <p className="text-[10px] text-center text-green-700 font-semibold mt-1">Pays for itself in 1 visit</p>
                    </div>
                  </div>
                )}
                <Button className={`w-full mt-4 rounded-xl text-sm ${plan.badge ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white' : ''}`}
                  variant={plan.badge ? 'default' : 'outline'} disabled={subscribing === plan.name} onClick={() => handleSubscribe(plan.name)}>
                  {subscribing === plan.name ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {subscribing === plan.name ? 'Processing...' : `Get ${plan.name}`}
                </Button>
              </div>
            ))}
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-4"><Shield className="h-3 w-3 inline mr-1" />Secure payment via Stripe. Cancel anytime. Discounts apply immediately.</p>
        </DialogContent>
      </Dialog>

      {/* ===== FLOATING BOOK BUTTON — mobile ===== */}
      <div className="fixed bottom-4 left-4 right-4 md:hidden z-40">
        <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white shadow-lg rounded-xl h-12 text-base font-semibold gap-2" asChild>
          <Link to="/book-now"><Plus className="h-5 w-5" /> Book Appointment</Link>
        </Button>
      </div>
    </div>
  );
};

export default PatientDashboard;
