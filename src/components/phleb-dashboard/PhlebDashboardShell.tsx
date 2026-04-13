import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { usePhlebotomistAppointments } from '@/hooks/usePhlebotomistAppointments';
import BottomNav, { PhlebTab } from './BottomNav';
import ScheduleTab from './schedule/ScheduleTab';
import CompletedTab from './completed/CompletedTab';
import MessagesTab from './messages/MessagesTab';
import SettingsTab from './settings/SettingsTab';

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
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white pb-20">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#B91C1C] to-[#991B1B] text-white px-4 py-5">
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

        {/* Quick Stats - only on schedule tab */}
        {activeTab === 'schedule' && (
          <div className="max-w-lg mx-auto px-4 -mt-4 mb-4">
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
        <div className="max-w-lg mx-auto px-4 mt-4">
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

        {/* Bottom Nav */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            if (tab === 'messages') setUnreadMessages(0);
          }}
          unreadMessages={unreadMessages}
        />
      </div>
    </NotificationsProvider>
  );
};

export default PhlebDashboardShell;
