import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, User, ArrowRight, Plus, Star, FileText, Bell, MessageSquare, Mail, Phone, LogOut, Check, Crown, Loader2, Shield } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import UpcomingAppointments from "@/components/appointments/UpcomingAppointments";
import AppointmentHistory from "@/components/appointments/AppointmentHistory";
import ReferralCard from "@/components/patient/ReferralCard";

const PLANS = [
  { name: 'Member', price: 99, color: 'border-blue-200', badge: '', mobile: '$130', save: '$20', features: ['Mobile visits: $130 (save $20)', 'Weekend appointments', 'Patient portal'] },
  { name: 'VIP', price: 199, color: 'border-[#B91C1C]', badge: 'Most Popular', mobile: '$115', save: '$35', features: ['Mobile visits: $115 (save $35)', 'Priority same-day', 'Family add-ons $45', 'Extended hours'] },
  { name: 'Concierge', price: 399, color: 'border-amber-400', badge: 'Best Value', mobile: '$99', save: '$51', features: ['Mobile visits: $99 (save $51)', 'Dedicated phlebotomist', 'Same-day guaranteed', 'NDA available', 'Concierge support'] },
];

const PatientDashboard = () => {
  const { user, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const [stats, setStats] = useState({ upcoming: 0, completed: 0, nextDate: '' });
  const [notifMethod, setNotifMethod] = useState<'sms' | 'email' | 'both'>('both');
  const [notifSaving, setNotifSaving] = useState(false);
  const [membershipModalOpen, setMembershipModalOpen] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  // Check for membership success redirect
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
    } catch (err: any) {
      toast.error(err.message || 'Failed to start checkout');
    } finally { setSubscribing(null); }
  };

  // Lightweight stats fetch — no heavy hook, no infinite loop
  useEffect(() => {
    if (!user) return;
    const loadStats = async () => {
      let all: any[] = [];
      const { data: byId } = await supabase.from('appointments').select('status, appointment_date')
        .eq('patient_id', user.id);
      if (byId) all = [...byId];
      if (user.email) {
        const { data: byEmail } = await supabase.from('appointments').select('status, appointment_date')
          .ilike('patient_email', user.email);
        if (byEmail) {
          const ids = new Set(all.map(a => a.id));
          all = [...all, ...(byEmail.filter(a => !ids.has(a.id)))];
        }
      }
      const upcoming = all.filter(a => ['scheduled', 'confirmed'].includes(a.status));
      const completed = all.filter(a => a.status === 'completed');
      const next = upcoming.sort((a, b) => new Date(a.appointment_date || 0).getTime() - new Date(b.appointment_date || 0).getTime())[0];
      const nextDate = next?.appointment_date ? new Date(next.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'None';
      setStats({ upcoming: upcoming.length, completed: completed.length, nextDate });
    };
    loadStats();

    supabase.from('email_preferences').select('notification_method').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.notification_method) setNotifMethod(data.notification_method as any); });
  }, [user?.id]);

  const handleNotifChange = async (method: 'sms' | 'email' | 'both') => {
    if (!user) return;
    setNotifSaving(true);
    setNotifMethod(method);
    const { error } = await supabase.from('email_preferences').upsert({
      user_id: user.id, notification_method: method, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    setNotifSaving(false);
    if (error) toast.error('Failed to save preference');
    else toast.success(`Notifications: ${method === 'both' ? 'SMS & Email' : method.toUpperCase()}`);
  };

  const upcomingCount = stats.upcoming;
  const completedCount = stats.completed;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 pb-20 md:pb-6">
      {/* Welcome */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Welcome, {user?.firstName || 'Patient'}</h1>
          <p className="text-muted-foreground text-sm">Manage your appointments and health records</p>
        </div>
        <Button className="bg-[#B91C1C] hover:bg-[#991B1B] text-white hidden md:flex" asChild>
          <Link to="/book-now"><Plus className="h-4 w-4 mr-1" /> Book Appointment</Link>
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs text-muted-foreground">Upcoming</p>
                <p className="text-xl md:text-2xl font-bold">{upcomingCount}</p>
              </div>
              <Calendar className="h-6 w-6 md:h-8 md:w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs text-muted-foreground">Completed</p>
                <p className="text-xl md:text-2xl font-bold">{completedCount}</p>
              </div>
              <FileText className="h-6 w-6 md:h-8 md:w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs text-muted-foreground">Next Visit</p>
                <p className="text-sm font-bold">
                  {stats.nextDate !== 'None'
                    ? stats.nextDate
                    : 'None'}
                </p>
              </div>
              <Clock className="h-6 w-6 md:h-8 md:w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs text-muted-foreground">Membership</p>
                <p className="text-sm font-bold">Non-member</p>
              </div>
              <Star className="h-6 w-6 md:h-8 md:w-8 text-amber-500 opacity-50" />
            </div>
            <Button variant="link" size="sm" className="px-0 mt-1 text-[10px] md:text-xs text-[#B91C1C]" onClick={() => setMembershipModalOpen(true)}>
              Upgrade & Save →
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Desktop: 3-col layout. Mobile: single column with reordered sections */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming Appointments */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base md:text-lg">Upcoming Appointments</CardTitle>
                <Button variant="ghost" size="sm" className="text-xs" asChild>
                  <Link to="/book-now">Book New <ArrowRight className="ml-1 h-3 w-3" /></Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <UpcomingAppointments />
            </CardContent>
          </Card>

          {/* Quick Actions — shown BEFORE past appointments on mobile */}
          <div className="grid grid-cols-2 gap-3 lg:hidden">
            <Button variant="outline" size="sm" className="justify-start gap-2 h-12" asChild>
              <Link to="/book-now"><Calendar className="h-4 w-4 text-[#B91C1C]" /> Book Appointment</Link>
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-2 h-12" asChild>
              <Link to="/pricing"><Star className="h-4 w-4 text-amber-500" /> Membership Plans</Link>
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-2 h-12" asChild>
              <a href="tel:9415279169"><Phone className="h-4 w-4 text-blue-500" /> Call ConveLabs</a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="justify-start gap-2 h-12 border-red-200 text-[#B91C1C]"
              onClick={async () => {
                try { await logout(); } catch { window.location.href = '/login'; }
              }}
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </div>

          {/* Referral — shown in flow on mobile */}
          <div className="lg:hidden">
            <ReferralCard />
          </div>

          {/* Notifications — compact on mobile */}
          <Card className="shadow-sm lg:hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold flex items-center gap-1.5"><Bell className="h-4 w-4" /> Notification Preference</p>
              </div>
              <div className="flex gap-2">
                {(['sms', 'email', 'both'] as const).map(method => (
                  <Button
                    key={method}
                    variant={notifMethod === method ? 'default' : 'outline'}
                    size="sm"
                    className={`flex-1 text-xs ${notifMethod === method ? 'bg-[#B91C1C] hover:bg-[#991B1B]' : ''}`}
                    onClick={() => handleNotifChange(method)}
                    disabled={notifSaving}
                  >
                    {method === 'sms' ? 'SMS' : method === 'email' ? 'Email' : 'Both'}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Past Appointments */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base md:text-lg">Past Appointments</CardTitle>
            </CardHeader>
            <CardContent>
              <AppointmentHistory />
            </CardContent>
          </Card>
        </div>

        {/* Desktop Sidebar — hidden on mobile (content shown inline above) */}
        <div className="hidden lg:block space-y-6">
          {/* Profile Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">My Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{user?.firstName} {user?.lastName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">{user?.email}</span>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-3" asChild>
                <Link to="/profile">Edit Profile</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Referral — desktop sidebar */}
          <ReferralCard />

          {/* Notification Preferences — desktop sidebar */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-4 w-4" /> Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">How would you like to receive reminders?</p>
              {(['sms', 'email', 'both'] as const).map(method => (
                <Button
                  key={method}
                  variant={notifMethod === method ? 'default' : 'outline'}
                  size="sm"
                  className={`w-full justify-start gap-2 ${notifMethod === method ? 'bg-[#B91C1C] hover:bg-[#991B1B]' : ''}`}
                  onClick={() => handleNotifChange(method)}
                  disabled={notifSaving}
                >
                  {method === 'sms' && <><MessageSquare className="h-4 w-4" /> SMS Only</>}
                  {method === 'email' && <><Mail className="h-4 w-4" /> Email Only</>}
                  {method === 'both' && <><Bell className="h-4 w-4" /> SMS & Email</>}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Quick Actions — desktop sidebar */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <Link to="/book-now"><Calendar className="h-4 w-4 mr-2" /> Book Appointment</Link>
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <Link to="/pricing"><Star className="h-4 w-4 mr-2" /> View Membership Plans</Link>
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <Link to="/profile"><User className="h-4 w-4 mr-2" /> Update Profile</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start border-red-200 text-[#B91C1C] hover:bg-red-50"
                onClick={async () => {
                  try { await logout(); } catch { window.location.href = '/login'; }
                }}
              >
                <LogOut className="h-4 w-4 mr-2" /> Sign Out
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Membership Modal */}
      <Dialog open={membershipModalOpen} onOpenChange={setMembershipModalOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-center">
              <Crown className="h-8 w-8 text-amber-500 mx-auto mb-2" />
              <span className="text-xl font-bold">Upgrade Your Experience</span>
              <p className="text-sm font-normal text-muted-foreground mt-1">Save on every visit with a ConveLabs membership</p>
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {PLANS.map(plan => (
              <div key={plan.name} className={`border-2 ${plan.color} rounded-xl p-4 relative ${plan.badge ? 'ring-1 ring-[#B91C1C]/20' : ''}`}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#B91C1C] text-white text-[10px] font-bold px-3 py-0.5 rounded-full">{plan.badge}</div>
                )}
                <h3 className="font-bold text-lg">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold">${plan.price}</span>
                  <span className="text-xs text-muted-foreground">/year</span>
                </div>
                <div className="bg-green-50 text-green-700 text-xs font-semibold px-2 py-1 rounded-full inline-block mt-2">
                  Mobile from {plan.mobile}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-1.5 text-xs">
                      <Check className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className={`w-full mt-4 rounded-xl text-sm ${plan.badge ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white' : ''}`}
                  variant={plan.badge ? 'default' : 'outline'}
                  disabled={subscribing === plan.name}
                  onClick={() => handleSubscribe(plan.name)}
                >
                  {subscribing === plan.name ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {subscribing === plan.name ? 'Processing...' : `Get ${plan.name}`}
                </Button>
              </div>
            ))}
          </div>

          <p className="text-center text-[10px] text-muted-foreground mt-4">
            <Shield className="h-3 w-3 inline mr-1" />
            Secure payment via Stripe. Cancel anytime. Discounts apply immediately.
          </p>
        </DialogContent>
      </Dialog>

      {/* Floating Book Button — mobile only */}
      <div className="fixed bottom-4 left-4 right-4 md:hidden z-40">
        <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white shadow-lg rounded-xl h-12 text-base font-semibold gap-2" asChild>
          <Link to="/book-now"><Plus className="h-5 w-5" /> Book Appointment</Link>
        </Button>
      </div>
    </div>
  );
};

export default PatientDashboard;
