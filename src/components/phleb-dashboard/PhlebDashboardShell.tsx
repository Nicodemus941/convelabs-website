import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
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
import { FolderOpen, Truck, DollarSign } from 'lucide-react';

const DESKTOP_TABS: { id: PhlebTab; label: string; icon: React.ElementType }[] = [
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'directory', label: 'Directory', icon: FolderOpen },
  { id: 'deliveries', label: 'Deliveries', icon: Truck },
  { id: 'earnings', label: 'Earnings', icon: DollarSign },
  { id: 'completed', label: 'Completed', icon: CheckCircle2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const PhlebDashboardShell: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<PhlebTab>(() => {
    const saved = sessionStorage.getItem('phleb-active-tab');
    return (saved as PhlebTab) || 'schedule';
  });
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Persist active tab so it survives PWA background/reload
  useEffect(() => {
    sessionStorage.setItem('phleb-active-tab', activeTab);
  }, [activeTab]);

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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_messages' }, (payload) => {
        const msg = payload.new as any;
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
          const monthAppts = appointments.filter(a => (a.appointment_date || '').startsWith(monthPrefix));
          const monthRemaining = monthAppts.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length;
          const monthCompleted = monthAppts.filter(a => a.status === 'completed').length;
          const monthLabel = now.toLocaleString('en-US', { month: 'short' });
          return (
            <div className="max-w-lg md:max-w-6xl mx-auto px-4 md:px-6 mb-4">
              <div className="flex items-baseline justify-between mb-1.5 px-1">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{monthLabel} {now.getFullYear()}</p>
                <p className="text-[10px] text-gray-400">Current month only</p>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-white rounded-xl border border-[#EFE3E1] shadow-sm p-3 text-center">
                  <p className="text-2xl font-bold text-[#B91C1C] tabular-nums">{monthRemaining}</p>
                  <p className="text-[11px] text-[#8B7C7E] font-medium">Remaining</p>
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
          <div hidden={activeTab !== 'completed'}>
            <CompletedTab appointments={appointments} />
          </div>
          <div hidden={activeTab !== 'messages'}>
            <MessagesTab appointments={appointments} />
          </div>
          <div hidden={activeTab !== 'directory'}>
            <DirectoryTab />
          </div>
          <div hidden={activeTab !== 'deliveries'}>
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
