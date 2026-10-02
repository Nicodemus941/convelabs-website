import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getUnreadReleaseCount } from '@/data/releaseNotes';
import { countActionItems } from './inbox/inboxQueries';

/**
 * Live counts for the admin sidebar badges.
 *
 * Lifted out of AdminSidebar so the consolidated Inbox section can show the
 * same numbers on its sub-tabs without a second set of subscriptions. Each
 * count keeps its own realtime channel and recounts on change rather than
 * polling.
 */
export type AdminBadgeCounts = {
  /** Aggregate shown on the Inbox nav item. */
  inbox: number;
  actionItems: number;
  /** New provider-partnership inquiries awaiting a first response. */
  partnerInquiries: number;
  tasks: number;
  sms: number;
  chat: number;
  labOrders: number;
  release: number;
};

export function useAdminBadges(userId: string | undefined): AdminBadgeCounts {
  const location = useLocation();
  const [actionItems, setActionItems] = useState(0);
  const [partnerInquiries, setPartnerInquiries] = useState(0);
  const [tasks, setTasks] = useState(0);
  const [sms, setSms] = useState(0);
  const [chat, setChat] = useState(0);
  const [labOrders, setLabOrders] = useState(0);
  const [release, setRelease] = useState<number>(() => getUnreadReleaseCount());

  // Release notes are tracked in localStorage — re-read on every navigation so
  // visiting What's New clears the badge immediately.
  useEffect(() => { setRelease(getUnreadReleaseCount()); }, [location.pathname]);

  // ── OPEN TASKS ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    const recount = async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_open_task_count' as any);
        if (!error && mounted) setTasks(typeof data === 'number' ? data : Number(data) || 0);
      } catch { /* silent */ }
    };
    recount();
    // Any activity_log change can move the count for this user (assignment to
    // me, status flip away from open/in_progress). Cheaper to re-run the RPC
    // than to compute the delta client-side.
    const ch = supabase
      .channel('admin-task-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, () => recount())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [userId]);

  // ── ACTION ITEMS ──────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    const recount = async () => {
      try {
        // 2026-05-21: a hand-copied filter here drifted from InboxTab (ghost
        // rows, snoozed orgs, patients who already attached a card), so the
        // badge never matched the list. 2026-10-02: both now call the SAME
        // functions in inbox/inboxQueries.ts — insurance + practices to call
        // + new partner inquiries — so the number equals the rows you'll see.
        const c = await countActionItems();
        if (mounted) { setActionItems(c.insurance + c.orgs); setPartnerInquiries(c.partners); }
      } catch { /* silent */ }
    };
    recount();
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(recount, 500); };
    const ch = supabase
      .channel('admin-inbox-badge')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'pending_insurance_changes' }, bump)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'organizations' }, bump)
      // A practice asking to partner is the highest-value lead the business
      // gets; it is listed in Needs attention and counted here.
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'provider_partnership_inquiries' }, bump)
      .subscribe();
    return () => { mounted = false; if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [userId]);

  // ── LAB ORDERS ────────────────────────────────────────────────────
  // Unviewed provider-uploaded orders. Ticks the moment a provider hits
  // submit in their portal.
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    const recount = async () => {
      try {
        const { count } = await supabase
          .from('patient_lab_requests' as any)
          .select('id', { count: 'exact', head: true })
          .is('admin_viewed_at', null)
          .eq('status', 'pending_schedule');
        if (mounted) setLabOrders(count || 0);
      } catch { /* silent */ }
    };
    recount();
    const ch = supabase
      .channel('admin-lab-order-badge')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'patient_lab_requests' }, () => recount())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [userId]);

  // ── WEBSITE CHAT ──────────────────────────────────────────────────
  // staff_unread is set when a chat escalates to a human AND on every
  // visitor reply during handoff. Opening the conversation clears it.
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    const recount = async () => {
      try {
        const { count } = await supabase
          .from('chatbot_conversations' as any)
          .select('id', { count: 'exact', head: true })
          .eq('staff_unread', true);
        if (mounted) setChat(count || 0);
      } catch { /* silent */ }
    };
    recount();
    const ch = supabase
      .channel('admin-chat-inbox-badge')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'chatbot_conversations' }, () => recount())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [userId]);

  // ── INBOUND SMS ───────────────────────────────────────────────────
  // Outbound messages also land in sms_messages (two-way threading), so the
  // direction filter is critical — otherwise the badge would fire on every
  // message the admin themselves sent.
  useEffect(() => {
    let mounted = true;
    const onSmsTab = location.pathname.includes('/inbox/sms');
    const recount = async () => {
      try {
        const lastSeen = localStorage.getItem('convelabs_sms_tab_last_seen');
        const since = lastSeen
          ? new Date(lastSeen).toISOString()
          : new Date(Date.now() - 86400_000).toISOString();
        const { count } = await supabase
          .from('sms_messages' as any)
          .select('id', { count: 'exact', head: true })
          .eq('direction', 'inbound')
          .gt('created_at', since);
        if (mounted) setSms(onSmsTab ? 0 : (count || 0));
      } catch { /* silent */ }
    };
    recount();
    const ch = supabase
      .channel('admin-sms-indicator')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sms_messages', filter: 'direction=eq.inbound' },
        () => { if (!onSmsTab) recount(); }
      )
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [location.pathname]);

  // Stamp last-seen when the SMS view is open so the badge clears and stays clear.
  useEffect(() => {
    if (!location.pathname.includes('/inbox/sms')) return;
    setSms(0);
    try { localStorage.setItem('convelabs_sms_tab_last_seen', new Date().toISOString()); }
    catch { /* localStorage may be unavailable */ }
  }, [location.pathname]);

  return {
    inbox: actionItems + partnerInquiries + tasks + sms + chat,
    actionItems: actionItems + partnerInquiries,
    partnerInquiries,
    tasks,
    sms,
    chat,
    labOrders,
    release,
  };
}

const ZERO: AdminBadgeCounts = {
  inbox: 0, actionItems: 0, partnerInquiries: 0, tasks: 0, sms: 0, chat: 0, labOrders: 0, release: 0,
};

const AdminBadgeContext = createContext<AdminBadgeCounts>(ZERO);

/**
 * Provided once by AdminLayout so the sidebar and the section sub-tab bar read
 * the same numbers from one set of realtime channels. Calling useAdminBadges in
 * both places instead would open two subscriptions per topic on the same
 * channel name.
 *
 * Deliberately mounted only under AdminLayout: patients and phlebotomists never
 * render it, so they never open these subscriptions.
 */
export const AdminBadgeProvider: React.FC<{ userId: string | undefined; children: React.ReactNode }> = ({ userId, children }) => {
  const counts = useAdminBadges(userId);
  return <AdminBadgeContext.Provider value={counts}>{children}</AdminBadgeContext.Provider>;
};

export function useAdminBadgeCounts(): AdminBadgeCounts {
  return useContext(AdminBadgeContext);
}
