import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { usePhlebotomistAppointments } from '@/hooks/usePhlebotomistAppointments';
import PhlebEarningsCard from './PhlebEarningsCard';
import { Calendar, MessageSquare, CheckCircle2, Settings, Home } from 'lucide-react';
import BottomNav, { PhlebTab } from './BottomNav';
import OnDutyToggle from './OnDutyToggle';
import ScheduleTab from './schedule/ScheduleTab';
import CompletedTab from './completed/CompletedTab';
import MessagesTab from './messages/MessagesTab';
import SettingsTab from './settings/SettingsTab';
import DirectoryTab from './directory/DirectoryTab';
import DeliveriesTab from './deliveries/DeliveriesTab';
import PhlebEarningsLedger from './PhlebEarningsLedger';
import { FolderOpen, Truck, DollarSign, BellRing, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { initPush } from '@/lib/native/push';

const FIELD_VISIT_ACTIVE_STATUSES = new Set([
  'scheduled',
  'confirmed',
  'en_route',
  'arrived',
  'in_progress',
]);

const DESKTOP_TABS: { id: PhlebTab; label: string; icon: React.ElementType }[] = [
  { id: 'schedule', label: 'Today', icon: Calendar },
  { id: 'messages', label: 'Inbox', icon: MessageSquare },
  { id: 'directory', label: 'Resources', icon: FolderOpen },
  { id: 'deliveries', label: 'Labs', icon: Truck },
  { id: 'earnings', label: 'Pay', icon: DollarSign },
  { id: 'completed', label: 'History', icon: CheckCircle2 },
  { id: 'settings', label: 'Profile', icon: Settings },
];

interface PhlebSmsRow {
  direction?: string | null;
}

type ScheduleMobileView = 'run' | 'history' | 'labs';

const PhlebDashboardShell: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<PhlebTab>(() => {
    const saved = sessionStorage.getItem('phleb-active-tab');
    if (saved === 'completed' || saved === 'deliveries') {
      return window.matchMedia('(min-width: 768px)').matches ? (saved as PhlebTab) : 'schedule';
    }
    return (saved as PhlebTab) || 'schedule';
  });
  const [scheduleView, setScheduleView] = useState<ScheduleMobileView>(() => {
    const savedView = sessionStorage.getItem('phleb-schedule-view');
    if (savedView === 'run' || savedView === 'history' || savedView === 'labs') return savedView;
    const saved = sessionStorage.getItem('phleb-active-tab');
    if (saved === 'completed') return 'history';
    if (saved === 'deliveries') return 'labs';
    return 'run';
  });
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Persist active tab so it survives PWA background/reload
  useEffect(() => {
    sessionStorage.setItem('phleb-active-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem('phleb-schedule-view', scheduleView);
  }, [scheduleView]);

  // Push-notification deep link: /phleb-app?appt=<id> (tap on a banner).
  // Force the Schedule tab so ScheduleTab can pick the ?appt= param up,
  // scroll to that card, and highlight it. Runs once per mount — the tap
  // cold-launches the app or triggers a full navigation, so mount is the
  // deep-link entry point.
  useEffect(() => {
    const apptParam = new URLSearchParams(window.location.search).get('appt');
    if (apptParam) setActiveTab('schedule');
  }, []);

  // Stripe Connect onboarding should land the phleb back in Settings so the
  // capability refresh is visible instead of dropping them on an unrelated tab.
  useEffect(() => {
    const connectParam = new URLSearchParams(window.location.search).get('connect');
    if (connectParam) setActiveTab('settings');
  }, []);

  // ── Native push enrollment ──────────────────────────────────────────
  // Silent attempt on login: registers the token if permission was already
  // granted, but NEVER triggers the OS dialog (iOS only allows one ask).
  // If not granted yet, show a one-time priming banner; its button runs the
  // real request. Foreground pushes (OS suppresses the banner while the app
  // is open) surface as an in-app toast that jumps to the appointment.
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  useEffect(() => {
    if (!user?.id || !Capacitor.isNativePlatform()) return;
    (async () => {
      const { granted } = await initPush(user.id, onForegroundPush, { silent: true });
      if (!granted && localStorage.getItem('phleb-push-prompt-dismissed') !== '1') {
        setShowPushPrompt(true);
      }
    })();
  }, [user?.id]);

  const onForegroundPush = (msg: { title: string; body: string; appointmentId: string | null }) => {
    toast(msg.title, {
      description: msg.body,
      duration: 8000,
      action: msg.appointmentId
        ? { label: 'View', onClick: () => { window.location.assign(`/phleb-app?appt=${encodeURIComponent(msg.appointmentId!)}`); } }
        : undefined,
    });
  };

  const enablePush = async () => {
    if (!user?.id) return;
    setShowPushPrompt(false);
    const { granted } = await initPush(user.id, onForegroundPush);
    if (granted) {
      toast.success("You're set — new bookings will ping this phone.");
    } else {
      toast.error('Notifications are off. You can enable them anytime in your phone Settings → ConveLabs Pro.');
      localStorage.setItem('phleb-push-prompt-dismissed', '1');
    }
  };

  const {
    appointments,
    isLoading,
    monthDates,
    fetchMonthAppointments,
    updateStatus,
    isOnline,
    lastCacheAt,
  } = usePhlebotomistAppointments();

  // Listen for new inbound SMS messages
  useEffect(() => {
    const channel = supabase
      .channel('phleb-sms-indicator')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_messages' }, (payload: RealtimePostgresInsertPayload<PhlebSmsRow>) => {
        const msg = payload.new;
        if (msg.direction === 'inbound' && activeTab !== 'messages') {
          setUnreadMessages(prev => prev + 1);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeTab]);

  const greeting = new Date().getHours() < 12 ? 'morning' : 'afternoon';

  return (
    <NotificationsProvider>
      {/* Warm paper wash — approved mockup ground (#F6F0EE) */}
      <div className="min-h-screen bg-[#F6F0EE] pb-20 md:pb-0">
        {/* Desktop Top Nav - hidden on mobile */}
        <div className="hidden md:block bg-white border-b shadow-sm sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
            <Link to="/" className="text-xl font-bold text-gray-900">
              ConveLabs<span className="text-[#B91C1C]">.</span>
            </Link>
            <nav className="flex items-center gap-1">
              {DESKTOP_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setActiveTab(id); if (id === 'messages') setUnreadMessages(0); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                    activeTab === id
                      ? 'bg-[#B91C1C]/10 text-[#B91C1C]'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {id === 'messages' && unreadMessages > 0 && (
                    <span className="absolute -top-0.5 right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  )}
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              <OnDutyToggle variant="desktop" />
              <NotificationCenter />
              <Link to="/" className="text-xs text-gray-400 hover:text-gray-600">
                Back to Website
              </Link>
            </div>
          </div>
        </div>

        {/* Mobile Header — approved mockup: light-on-wash with crimson avatar,
            greeting stack, duty toggle right (replaces the old red banner). */}
        <div className="md:hidden px-4 pt-3 pb-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <div className="h-10 w-10 rounded-full flex-shrink-0 bg-gradient-to-br from-[#D23B2E] to-[#7F1010] text-white flex items-center justify-center font-bold text-sm shadow-sm">
              {`${user?.firstName?.[0] || 'P'}${user?.lastName?.[0] || ''}`.toUpperCase()}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="text-[11.5px] text-[#8B7C7E]">Good {greeting},</p>
              <h1 className="text-lg font-extrabold tracking-tight text-[#1A1416] truncate">{user?.firstName || 'Phlebotomist'}</h1>
              <p className="text-[10.5px] text-[#B7A9AB]">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              <OnDutyToggle variant="mobile" />
              <NotificationCenter />
            </div>
          </div>
        </div>

        {/* Desktop Welcome Banner */}
        <div className="hidden md:block bg-gradient-to-r from-[#B91C1C] to-[#991B1B] text-white px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-white flex items-center justify-center overflow-hidden shadow-sm">
                <img src="/apple-touch-icon.png" alt="ConveLabs" className="h-10 w-10 object-contain" />
              </div>
              <div>
                <p className="text-red-200 text-sm">Good {greeting},</p>
                <h1 className="text-xl font-bold">{user?.firstName || 'Phlebotomist'}</h1>
              </div>
            </div>
            <p className="text-red-100 text-sm">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          </div>
        </div>

        {/* Push-notification priming banner (native only, until enabled).
            Explains the value BEFORE the one-shot iOS permission dialog. */}
        {showPushPrompt && (
          <div className="max-w-lg mx-auto px-3 sm:px-4 pt-3">
            <div className="bg-white border border-[#EFE3E1] rounded-xl shadow-sm p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <BellRing className="h-4.5 w-4.5 text-[#B91C1C]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Never miss a booking</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Get pinged the second a new appointment lands, reschedules, or cancels — tap the alert and it opens straight to the job.
                </p>
                <div className="flex gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={enablePush}
                    className="bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold rounded-lg px-4 py-2 transition"
                  >
                    Turn on notifications
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowPushPrompt(false); localStorage.setItem('phleb-push-prompt-dismissed', '1'); }}
                    className="text-xs text-gray-500 px-2 py-2"
                  >
                    Not now
                  </button>
                </div>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => { setShowPushPrompt(false); localStorage.setItem('phleb-push-prompt-dismissed', '1'); }}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Earnings scoreboard — Hormozi: top-of-mind = top-of-screen.
            Phleb opens dashboard wanting to know "what am I making today
            and how does it stack up against my $5K monthly goal." Real-
            time subscribed to appointments + staff_payouts. */}
        {activeTab === 'schedule' && <PhlebEarningsCard />}

        {/* Quick Stats — THIS MONTH scoped (previously showed 5-month
            rolling window from the data hook, which made the numbers
            inflated and confusing). Now reflects the current calendar
            month so "31 remaining / 95 completed" is real for May 2026. */}
        {activeTab === 'schedule' && (() => {
          const now = new Date();
          const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const monthAppts = appointments.filter(a => (a.appointment_date || '').startsWith(monthPrefix) && a.status !== 'cancelled');
          const monthRemaining = monthAppts.filter(a => FIELD_VISIT_ACTIVE_STATUSES.has(a.status)).length;
          const monthCompleted = monthAppts.filter(a => a.status === 'completed').length;
          const monthWrapUps = monthAppts.filter(a => a.status === 'specimen_delivered').length;
          const monthLabel = now.toLocaleString('en-US', { month: 'short' });
          return (
            <div className="max-w-lg md:max-w-6xl mx-auto px-4 md:px-6 mb-4">
              <div className="flex items-baseline justify-between mb-1.5 px-1">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{monthLabel} {now.getFullYear()}</p>
                <p className="text-[10px] text-gray-400">
                  {monthWrapUps > 0 ? `${monthWrapUps} wrap-up${monthWrapUps === 1 ? '' : 's'} pending` : 'Current month only'}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-white rounded-xl border border-[#EFE3E1] shadow-sm p-3 text-center">
                  <p className="text-2xl font-bold text-[#B91C1C] tabular-nums">{monthRemaining}</p>
                  <p className="text-[11px] text-[#8B7C7E] font-medium">Field Visits Left</p>
                </div>
                <div className="bg-white rounded-xl border border-[#EFE3E1] shadow-sm p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600 tabular-nums">{monthCompleted}</p>
                  <p className="text-[11px] text-[#8B7C7E] font-medium">Completed</p>
                </div>
                <div className="bg-white rounded-xl border border-[#EFE3E1] shadow-sm p-3 text-center">
                  <p className="text-2xl font-bold text-[#1A1416] tabular-nums">{monthAppts.length}</p>
                  <p className="text-[11px] text-[#8B7C7E] font-medium">This month</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/*
          Tab Content — hide via CSS instead of unmounting. Pre-fix, switching
          tabs unmounted the prior subtree, destroying scroll position, expanded-
          card state, and any in-progress modal state. Now every tab stays in
          the tree once visited and we toggle `hidden`.
        */}
        <div className="max-w-lg md:max-w-6xl mx-auto px-4 md:px-6 mt-4">
          <div hidden={activeTab !== 'schedule'}>
            <div className="md:hidden mb-4">
              <div className="rounded-2xl border border-[#EFE3E1] bg-white p-2 shadow-sm">
                <div className="flex items-center justify-between gap-3 px-2 pb-2">
                  <div>
                    <p className="text-sm font-semibold text-[#1A1416]">Today lane</p>
                    <p className="text-xs text-[#8B7C7E]">Run the day, then review history or lab handoffs without leaving this lane.</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'run' as const, label: 'Run' },
                    { id: 'history' as const, label: 'History' },
                    { id: 'labs' as const, label: 'Labs' },
                  ].map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      onClick={() => setScheduleView(view.id)}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        scheduleView === view.id
                          ? 'bg-[#B91C1C] text-white shadow-sm'
                          : 'bg-[#F6F0EE] text-[#7A5E61]'
                      }`}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div hidden={scheduleView !== 'run'}>
              <ScheduleTab
                appointments={appointments}
                isLoading={isLoading}
                monthDates={monthDates}
                onRefresh={() => fetchMonthAppointments()}
                onStatusUpdate={updateStatus}
                isOnline={isOnline}
                lastCacheAt={lastCacheAt}
              />
            </div>
            <div hidden={scheduleView !== 'history'} className="md:hidden">
              <CompletedTab appointments={appointments} />
            </div>
            <div hidden={scheduleView !== 'labs'} className="md:hidden">
              <DeliveriesTab />
            </div>
          </div>
          <div hidden={activeTab !== 'completed'} className="hidden md:block">
            <CompletedTab appointments={appointments} />
          </div>
          <div hidden={activeTab !== 'messages'}>
            <MessagesTab appointments={appointments} />
          </div>
          <div hidden={activeTab !== 'directory'}>
            <DirectoryTab />
          </div>
          <div hidden={activeTab !== 'deliveries'} className="hidden md:block">
            <DeliveriesTab />
          </div>
          <div hidden={activeTab !== 'earnings'} className="max-w-lg md:max-w-3xl mx-auto pb-24">
            <PhlebEarningsLedger />
          </div>
          <div hidden={activeTab !== 'settings'}>
            <SettingsTab />
          </div>
        </div>

        {/* Bottom Nav - mobile only */}
        <div className="md:hidden">
          <BottomNav
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              if (tab === 'schedule') setScheduleView('run');
              if (tab === 'messages') setUnreadMessages(0);
            }}
            unreadMessages={unreadMessages}
          />
        </div>
      </div>
    </NotificationsProvider>
  );
};

export default PhlebDashboardShell;
