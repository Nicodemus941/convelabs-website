import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { usePhlebotomistAppointments } from '@/hooks/usePhlebotomistAppointments';
import { Calendar, MessageSquare, CheckCircle2, Settings, Home } from 'lucide-react';
import BottomNav, { PhlebTab } from './BottomNav';
import ScheduleTab from './schedule/ScheduleTab';
import CompletedTab from './completed/CompletedTab';
import MessagesTab from './messages/MessagesTab';
import SettingsTab from './settings/SettingsTab';

const DESKTOP_TABS: { id: PhlebTab; label: string; icon: React.ElementType }[] = [
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'completed', label: 'Completed', icon: CheckCircle2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const PhlebDashboardShell: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<PhlebTab>('schedule');
  const [unreadMessages, setUnreadMessages] = useState(0);

  const {
    appointments,
    isLoading,
    monthDates,
    fetchMonthAppointments,
    updateStatus,
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
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white pb-20 md:pb-0">
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
              <NotificationCenter />
              <Link to="/" className="text-xs text-gray-400 hover:text-gray-600">
                Back to Website
              </Link>
            </div>
          </div>
        </div>

        {/* Mobile Header - hidden on desktop */}
        <div className="md:hidden bg-gradient-to-r from-[#B91C1C] to-[#991B1B] text-white px-4 py-5">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-red-200 text-sm">Good {greeting},</p>
                <h1 className="text-xl font-bold">{user?.firstName || 'Phlebotomist'}</h1>
              </div>
              <NotificationCenter />
            </div>
            <p className="text-red-100 text-sm mt-1">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
        </div>

        {/* Desktop Welcome Banner */}
        <div className="hidden md:block bg-gradient-to-r from-[#B91C1C] to-[#991B1B] text-white px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div>
              <p className="text-red-200 text-sm">Good {greeting},</p>
              <h1 className="text-xl font-bold">{user?.firstName || 'Phlebotomist'}</h1>
            </div>
            <p className="text-red-100 text-sm">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          </div>
        </div>

        {/* Quick Stats - only on schedule tab */}
        {activeTab === 'schedule' && (
          <div className="max-w-lg md:max-w-6xl mx-auto px-4 md:px-6 -mt-4 mb-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl shadow-md p-3 text-center">
                <p className="text-2xl font-bold text-[#B91C1C]">
                  {appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length}
                </p>
                <p className="text-xs text-muted-foreground">Remaining</p>
              </div>
              <div className="bg-white rounded-xl shadow-md p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600">
                  {appointments.filter(a => a.status === 'completed').length}
                </p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="bg-white rounded-xl shadow-md p-3 text-center">
                <p className="text-2xl font-bold text-gray-800">{appointments.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="max-w-lg md:max-w-6xl mx-auto px-4 md:px-6 mt-4">
          {activeTab === 'schedule' && (
            <ScheduleTab
              appointments={appointments}
              isLoading={isLoading}
              monthDates={monthDates}
              onRefresh={() => fetchMonthAppointments()}
              onStatusUpdate={updateStatus}
            />
          )}
          {activeTab === 'completed' && (
            <CompletedTab appointments={appointments} />
          )}
          {activeTab === 'messages' && (
            <MessagesTab appointments={appointments} />
          )}
          {activeTab === 'settings' && (
            <SettingsTab />
          )}
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
