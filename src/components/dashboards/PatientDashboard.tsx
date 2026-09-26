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
      // Cast to any[]: the generated Supabase types are stale and don't yet
      // include `view_token`, which makes the typed result a SelectQueryError.
      // The column exists in the DB; runtime is correct.
      if (byId) all = [...(byId as any[])];
      if (user.email) {
        const { data: byEmail } = await supabase.from('appointments').select('id, status, appointment_date, appointment_time, total_amount, payment_status, lab_order_file_path, view_token')
          .ilike('patient_email', user.email);
        if (byEmail) { const ids = new Set(all.map(a => a.id)); all = [...all, ...((byEmail as any[]).filter(a => !ids.has(a.id)))]; }
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
    <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 pb-24 md:pb-8">

      {/* P5 — Member savings trophy. Only renders for active members with
          at least one paid visit; silent for non-members + first-time members. */}
      <MemberSavingsBanner />

      {/* ===== THE ANSWER THEY OPENED THIS FOR =====
          One ink card, four states. Gradients were doing the emotional work
          before; the type does it now, so the state reads from the words and
          the one accent dot rather than from a colour wash. */}
      {isOverdue && !hasUpcoming ? (
        // OVERDUE — their own rhythm, not an arbitrary threshold.
        <section className="bg-[#1A1416] text-[#FBF9F6] rounded-2xl p-6 sm:p-9 mb-5">
          <p className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#C9BFB4] mb-4">
            <span className="h-[7px] w-[7px] rounded-full bg-[#E8705F]" /> Time for your next draw
          </p>
          <h2 className="font-playfair text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.04]">
            {stats.daysSince} days since your last draw
          </h2>
          <p className="text-base sm:text-xl text-[#E4DCD2] mt-3">
            {stats.avgFrequency > 0
              ? `You usually go about ${stats.avgFrequency} days.`
              : 'Most doctors recommend testing every 90 days.'}
          </p>
          <div className="flex flex-wrap gap-3 mt-7">
            <Link to="/book-now" className="bg-[#FBF9F6] text-[#1A1416] text-[15px] font-semibold px-6 py-3.5 rounded-full hover:bg-white">
              Book a draw
            </Link>
            <button type="button" onClick={() => setMembershipModalOpen(true)}
              className="border border-[#4A423E] text-[#FBF9F6] text-[15px] font-semibold px-6 py-3.5 rounded-full hover:bg-white/10">
              {stats.totalSpent > 0 ? `Save $${Math.round(stats.totalSpent * 0.13)} a year` : 'Compare plans'}
            </button>
          </div>
        </section>
      ) : hasUpcoming ? (
        // UPCOMING — the date is the headline, prep is secondary.
        // Readiness stays dynamic per the Valli/Ritenour trust fix 2026-05-17:
        // once the lab order is uploaded the chip confirms it, else it nudges.
        <section className="bg-[#1A1416] text-[#FBF9F6] rounded-2xl p-6 sm:p-9 mb-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-7">
            <div className="min-w-0">
              <p className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#C9BFB4] mb-4">
                <span className="h-[7px] w-[7px] rounded-full bg-[#E8705F]" /> Your next draw
              </p>
              <h2 className="font-playfair text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.04]">
                {stats.nextDate}
              </h2>
              {stats.nextTime && (
                <p className="text-base sm:text-xl text-[#E4DCD2] mt-3">{stats.nextTime} · at your address</p>
              )}

              {/* Prep chips — status grammar: bone = confirmed, amber = still needed */}
              <div className="flex flex-wrap gap-2 mt-6">
                {(stats as any).nextHasLabOrder ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide bg-[#FBF9F6] text-[#1A1416] rounded-full px-3 py-1.5">
                    <Check className="h-3 w-3" /> Lab order on file
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide bg-[#FFE9C7] text-[#7A4A05] rounded-full px-3 py-1.5">
                    Lab order needed
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide bg-[#FBF9F6] text-[#1A1416] rounded-full px-3 py-1.5">
                  Bring insurance card
                </span>
              </div>

              <p className="text-[13px] text-[#C9BFB4] mt-4 max-w-md leading-relaxed">
                Your lab (Quest, LabCorp, AdventHealth) bills your insurance directly — not us.
              </p>
              <span className="inline-flex items-center gap-2 mt-3 text-[13px] font-semibold rounded-full border border-[#4A423E] px-4 py-2">
                <Shield className="h-3.5 w-3.5" /> On time, or this visit is on us.
              </span>
            </div>

            <div className="flex flex-wrap gap-3 lg:flex-col lg:w-56 lg:flex-shrink-0">
              {(stats as any).nextToken && (
                <Link to={`/appt/${(stats as any).nextToken}/confirm`}
                  className="text-center bg-[#FBF9F6] text-[#1A1416] text-[15px] font-semibold px-6 py-3.5 rounded-full hover:bg-white">
                  Reschedule
                </Link>
              )}
              <Link to="/book-now"
                className="text-center border border-[#4A423E] text-[#FBF9F6] text-[15px] font-semibold px-6 py-3.5 rounded-full hover:bg-white/10">
                Book another
              </Link>
              <Link to="/profile"
                className="text-center text-[#C9BFB4] text-[15px] font-medium px-6 py-2 hover:text-[#FBF9F6]">
                My profile
              </Link>
            </div>
          </div>
        </section>
      ) : isNewPatient ? (
        // NEW PATIENT — one thing to do.
        <section className="bg-[#1A1416] text-[#FBF9F6] rounded-2xl p-6 sm:p-9 mb-5">
          <p className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#C9BFB4] mb-4">
            <span className="h-[7px] w-[7px] rounded-full bg-[#E8705F]" /> Welcome
          </p>
          <h2 className="font-playfair text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.04]">
            Let&rsquo;s get your first draw booked, {user?.firstName || 'there'}
          </h2>
          <p className="text-base sm:text-xl text-[#E4DCD2] mt-3">
            A licensed phlebotomist at your door, in about an hour.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-7">
            <Link to="/book-now" className="bg-[#FBF9F6] text-[#1A1416] text-[15px] font-semibold px-6 py-3.5 rounded-full hover:bg-white">
              Book your first visit
            </Link>
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold rounded-full border border-[#4A423E] px-4 py-2">
              <Shield className="h-3.5 w-3.5" /> On time, or it&rsquo;s free.
            </span>
          </div>
        </section>
      ) : (
        // ON TRACK — quiet by design. This state is not an emergency.
        <section className="bg-[#1A1416] text-[#FBF9F6] rounded-2xl p-6 sm:p-9 mb-5">
          <p className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#C9BFB4] mb-4">
            <span className="h-[7px] w-[7px] rounded-full bg-[#9BBFA8]" /> You&rsquo;re on track
          </p>
          <h2 className="font-playfair text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.04]">
            Last drawn {stats.daysSince} days ago
          </h2>
          {stats.avgFrequency > 0 && (
            <p className="text-base sm:text-xl text-[#E4DCD2] mt-3">
              You test about every {stats.avgFrequency} days. Nothing needed today.
            </p>
          )}
          <div className="flex flex-wrap gap-3 mt-7">
            <Link to="/book-now" className="bg-[#FBF9F6] text-[#1A1416] text-[15px] font-semibold px-6 py-3.5 rounded-full hover:bg-white">
              Schedule the next one
            </Link>
          </div>
        </section>
      )}

      {/* ===== WHERE THEY STAND — summary before detail ===== */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
        <div className="bg-white rounded-2xl border border-[#E7E1D9] p-4 sm:p-6">
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] text-[#6B625C]">Draws completed</p>
          <p className="font-playfair text-2xl sm:text-4xl font-semibold tabular-nums text-[#1A1416] mt-2 leading-none">{stats.completed}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#E7E1D9] p-4 sm:p-6">
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] text-[#6B625C]">Since last draw</p>
          <p className={`font-playfair text-2xl sm:text-4xl font-semibold tabular-nums mt-2 leading-none ${stats.daysSince > 90 ? 'text-[#8F1515]' : 'text-[#1A1416]'}`}>
            {stats.daysSince > 0 ? `${stats.daysSince}d` : stats.completed > 0 ? 'Recent' : '—'}
          </p>
          {stats.daysSince > 90 && stats.avgFrequency > 0 && (
            <p className="text-[12px] font-semibold text-[#8F1515] mt-1.5">Longer than your usual {stats.avgFrequency}</p>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-[#E7E1D9] p-4 sm:p-6">
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] text-[#6B625C]">Total invested</p>
          <p className="font-playfair text-2xl sm:text-4xl font-semibold tabular-nums text-[#1A1416] mt-2 leading-none">${stats.totalSpent}</p>
        </div>
      </div>

      {/* ===== MEMBER BENEFITS — auto-hides for non-members ===== */}
      <PatientBenefitsCard />

      {/* ===== MAIN CONTENT ===== */}
      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <div className="lg:col-span-2 space-y-5">

          {/* Visits — upcoming and past under one roof, because a patient
              thinks in "my visits", not in two separate lists. */}
          <Card className="border-[#E7E1D9] rounded-2xl shadow-none">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="font-playfair text-xl font-semibold">Upcoming</CardTitle>
                <Link to="/book-now" className="text-[13px] font-semibold text-[#8F1515] hover:text-[#6B0F0F] inline-flex items-center">
                  Book new <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <UpcomingAppointments />
            </CardContent>
          </Card>

          <Card className="border-[#E7E1D9] rounded-2xl shadow-none">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="font-playfair text-xl font-semibold">Past visits</CardTitle>
                {stats.pastVisits > 0 && (
                  <span className="text-[13px] text-[#6B625C]">{stats.pastVisits} total</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <AppointmentHistory />
            </CardContent>
          </Card>

          {/* Recurring plans — only renders if the patient has any */}
          <MyRecurringPlans />

          {/* Referral — ours, not theirs, so it sits below their own history */}
          <ReferralCard />
        </div>

        {/* ===== SIDEBAR (desktop) ===== */}
        <div className="hidden lg:block space-y-5">
          <Card className="border-[#E7E1D9] rounded-2xl shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full bg-[#F3EEE7] border border-[#DDD5CB] text-[#1A1416] flex items-center justify-center font-bold text-sm">
                  {`${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || <User className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-[#6B625C] truncate">{user?.email}</p>
                </div>
              </div>
              <Link to="/profile" className="flex items-center justify-center gap-1 w-full border border-[#DDD5CB] rounded-full py-2.5 text-[14px] font-semibold hover:bg-[#F3EEE7]">
                Edit profile <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Plan — one line about what they already have, not a wall of tiers */}
          <Card className="border-[#E2DACF] bg-[#F3EEE7] rounded-2xl shadow-none">
            <CardContent className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6B625C]">Your plan</p>
              <p className="text-[15px] leading-relaxed text-[#403834] mt-2">
                {stats.totalSpent > 0
                  ? `You have spent $${stats.totalSpent} with us. A membership would have saved about $${Math.round(stats.totalSpent * 0.13)} of that.`
                  : 'Members pay less per draw, get weekend slots and priority scheduling.'}
              </p>
              <button type="button" onClick={() => setMembershipModalOpen(true)}
                className="mt-4 text-[14px] font-semibold text-[#8F1515] hover:text-[#6B0F0F] inline-flex items-center gap-1">
                Compare plans <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </CardContent>
          </Card>

          <Card className="border-[#E7E1D9] rounded-2xl shadow-none">
            <CardContent className="p-5 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6B625C]">Health summary</p>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#6B625C]">Draws completed</span>
                  <span className="font-semibold tabular-nums">{stats.completed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B625C]">Since last draw</span>
                  <span className={`font-semibold tabular-nums ${stats.daysSince > 90 ? 'text-[#8F1515]' : 'text-[#1A1416]'}`}>
                    {stats.daysSince > 0 ? `${stats.daysSince}d ago` : stats.completed > 0 ? 'Recent' : 'Never'}
                  </span>
                </div>
                {stats.avgFrequency > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#6B625C]">Your rhythm</span>
                    <span className="font-semibold tabular-nums">Every {stats.avgFrequency}d</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#6B625C]">Total invested</span>
                  <span className="font-semibold tabular-nums">${stats.totalSpent}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#E7E1D9] rounded-2xl shadow-none">
            <CardContent className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6B625C] mb-3">How we remind you</p>
              <div className="flex gap-2">
                {(['sms', 'email', 'both'] as const).map(method => (
                  <button key={method} type="button" onClick={() => handleNotifChange(method)} disabled={notifSaving}
                    className={`flex-1 rounded-full py-2.5 text-[13px] font-semibold border transition-colors disabled:opacity-60 ${
                      notifMethod === method
                        ? 'bg-[#1A1416] text-[#FBF9F6] border-[#1A1416]'
                        : 'border-[#DDD5CB] text-[#1A1416] hover:bg-[#F3EEE7]'
                    }`}>
                    {method === 'sms' ? 'SMS' : method === 'email' ? 'Email' : 'Both'}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#E7E1D9] rounded-2xl shadow-none">
            <CardContent className="p-3 space-y-0.5">
              <Link to="/profile" className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-[#F3EEE7]">
                <span className="flex items-center gap-2.5"><User className="h-4 w-4" /> My profile</span>
                <ChevronRight className="h-4 w-4 text-[#6B625C]" />
              </Link>
              <a href="tel:9415279169" className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-[#F3EEE7]">
                <span className="flex items-center gap-2.5"><Phone className="h-4 w-4" /> Call ConveLabs</span>
                <ChevronRight className="h-4 w-4 text-[#6B625C]" />
              </a>
              <button type="button"
                onClick={async () => { try { await logout(); } catch { window.location.href = '/login'; } }}
                className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-[#8F1515] hover:bg-[#FBF0F0]">
                <span className="flex items-center gap-2.5"><LogOut className="h-4 w-4" /> Sign out</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>
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
