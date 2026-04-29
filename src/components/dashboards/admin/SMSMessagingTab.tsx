import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import {
  MessageSquare, Send, Loader2, User, Phone, Mail,
  Search, Plus, Calendar, DollarSign, MapPin, ChevronRight,
  Inbox, Bell, ArrowLeft, X,
} from 'lucide-react';
import { toast } from '@/components/ui/sonner';

/**
 * SMS INBOX — Square Appointments style
 * 3-column layout: Conversation list | Thread | Customer context
 * Hormozi layer: every conversation shows revenue context (total spent, upcoming appts)
 */

interface PatientContact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  created_at: string;
  status?: string;
}

interface ConversationPreview {
  patient: PatientContact;
  lastMessage: string;
  lastMessageAt: string;
  lastDirection: 'inbound' | 'outbound';
  unread: boolean;
}

interface PatientAppointment {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  status: string;
  service_name: string | null;
  service_type: string | null;
  total_amount: number | null;
  payment_status: string | null;
  phlebotomist_id: string | null;
}

const SMSMessagingTab: React.FC = () => {
  const [patients, setPatients] = useState<PatientContact[]>([]);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [activePatient, setActivePatient] = useState<PatientContact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [patientAppts, setPatientAppts] = useState<PatientAppointment[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'inbox' | 'unread' | 'all'>('inbox');
  const [showCompose, setShowCompose] = useState(false);
  const [composePhone, setComposePhone] = useState('');
  const [composeName, setComposeName] = useState('');
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalTransactions, setTotalTransactions] = useState(0);
  // Mobile: show thread panel when patient selected
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [mobileShowContext, setMobileShowContext] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load patients + build conversation previews
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [{ data: pts }, { data: notifs }, { data: threadMsgs }, { data: convs }] = await Promise.all([
        supabase.from('tenant_patients').select('id, first_name, last_name, phone, email, address, city, state').not('phone', 'is', null).order('first_name'),
        supabase.from('sms_notifications' as any).select('phone_number, message_content, created_at').order('created_at', { ascending: false }),
        // Thread messages joined to their conversation so we know which patient phone they belong to
        supabase.from('sms_messages' as any)
          .select('id, conversation_id, direction, body, created_at, sms_conversations!inner(patient_phone, patient_id)')
          .order('created_at', { ascending: false }).limit(500),
        supabase.from('sms_conversations' as any).select('id, patient_phone, patient_id, last_message_at'),
      ]);

      const contactList: PatientContact[] = (pts || []).filter((p: any) => p.phone).map((p: any) => ({
        id: p.id,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown',
        phone: p.phone,
        email: p.email,
        address: p.address,
        city: p.city,
        state: p.state,
      }));
      setPatients(contactList);

      // Build conversation previews keyed by last-10-digits-of-phone
      const norm = (p: string | null | undefined) => (p || '').replace(/\D/g, '').slice(-10);
      const phoneToLastMsg = new Map<string, { body: string; at: string; dir: 'inbound' | 'outbound' }>();

      // From sms_messages (canonical — covers both inbound + outbound)
      for (const m of (threadMsgs as any[]) || []) {
        const conv = (m.sms_conversations || {}) as any;
        const phone = norm(conv.patient_phone);
        if (!phone) continue;
        if (!phoneToLastMsg.has(phone)) {
          phoneToLastMsg.set(phone, {
            body: m.body || '',
            at: m.created_at,
            dir: (m.direction === 'inbound' ? 'inbound' : 'outbound'),
          });
        }
      }

      // Legacy sms_notifications fill in any phones we haven't seen via threading yet
      for (const n of (notifs as any[]) || []) {
        const phone = norm(n.phone_number);
        if (!phone || phoneToLastMsg.has(phone)) continue;
        phoneToLastMsg.set(phone, { body: n.message_content || '', at: n.created_at, dir: 'outbound' });
      }

      // Pull last-viewed timestamps to compute unread state
      const lastViewed = (() => {
        try { return JSON.parse(localStorage.getItem('convelabs_sms_last_viewed') || '{}'); }
        catch { return {}; }
      })();

      const convos: ConversationPreview[] = [];
      for (const patient of contactList) {
        const phone = norm(patient.phone);
        const last = phoneToLastMsg.get(phone);
        if (last) {
          const lastViewedAt = lastViewed[patient.id];
          // Unread = there's an inbound message newer than last view, OR
          // last message is inbound and we've never opened this thread
          const unread = last.dir === 'inbound' && (
            !lastViewedAt || new Date(last.at) > new Date(lastViewedAt)
          );
          convos.push({
            patient,
            lastMessage: last.body,
            lastMessageAt: last.at,
            lastDirection: last.dir,
            unread,
          });
        }
      }
      convos.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
      setConversations(convos);
    } catch (err) {
      console.error('Error loading SMS data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load messages for active patient — properly scoped to this patient's
  // conversation. Uses sms_conversations as the threading anchor (one
  // conversation per patient phone), pulls all sms_messages tied to it,
  // plus legacy sms_notifications matched by phone (pre-threading rows).
  const loadMessages = useCallback(async (patient: PatientContact) => {
    const cleanPhone = patient.phone.replace(/\D/g, '').slice(-10);
    const phoneVariants = [cleanPhone, `+1${cleanPhone}`, patient.phone];

    // 1. Find this patient's conversation row (matches by last-10-digit
    //    normalized phone, same way the DB upsert RPC normalizes).
    const { data: convs } = await supabase
      .from('sms_conversations' as any)
      .select('id, patient_phone, patient_id')
      .or(`patient_id.eq.${patient.id},patient_phone.ilike.%${cleanPhone}%`)
      .limit(5);
    const convIds = (convs || []).map((c: any) => c.id);

    // 2. Pull threaded messages for those conversations
    const [{ data: threadMsgs }, { data: notifMsgs }, { data: appts }] = await Promise.all([
      convIds.length > 0
        ? supabase.from('sms_messages' as any).select('*')
            .in('conversation_id', convIds)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      supabase.from('sms_notifications' as any).select('*').order('created_at', { ascending: true }),
      supabase.from('appointments').select('*').eq('patient_id', patient.id).order('appointment_date', { ascending: false }),
    ]);

    const allMsgs: Message[] = [];
    // Threaded messages (canonical going forward)
    for (const m of (threadMsgs as any[]) || []) {
      allMsgs.push({
        id: m.id,
        direction: m.direction || 'outbound',
        body: m.body || '',
        created_at: m.created_at,
        status: m.status,
      });
    }
    // Legacy sms_notifications — match by phone, dedupe by twilio_message_sid
    // when we have it (otherwise by body+timestamp). Outbound only, since
    // sms_notifications was never used for inbound.
    const seenSids = new Set<string>();
    for (const m of (threadMsgs as any[]) || []) {
      if (m.twilio_message_sid) seenSids.add(m.twilio_message_sid);
    }
    for (const m of (notifMsgs as any[]) || []) {
      const msgPhone = (m.phone_number || '').replace(/^\+1/, '').replace(/\D/g, '').slice(-10);
      if (msgPhone === cleanPhone || phoneVariants.includes(m.phone_number)) {
        // Skip if already represented in threaded messages
        if (m.twilio_message_sid && seenSids.has(m.twilio_message_sid)) continue;
        allMsgs.push({
          id: m.id,
          direction: 'outbound',
          body: m.message_content || '',
          created_at: m.created_at,
        });
      }
    }

    allMsgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const seen = new Set<string>();
    const deduped = allMsgs.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    setMessages(deduped);

    // Mark this thread as read (clears the unread badge for this patient)
    try {
      const lastViewedKey = 'convelabs_sms_last_viewed';
      const stored = JSON.parse(localStorage.getItem(lastViewedKey) || '{}');
      stored[patient.id] = new Date().toISOString();
      localStorage.setItem(lastViewedKey, JSON.stringify(stored));
    } catch { /* localStorage may be unavailable */ }

    // Set appointment data for context panel
    const appointments = (appts || []) as PatientAppointment[];
    setPatientAppts(appointments);
    const paid = appointments.filter(a => a.payment_status === 'completed');
    setTotalSpent(paid.reduce((s, a) => s + (a.total_amount || 0), 0));
    setTotalTransactions(paid.length);
  }, []);

  useEffect(() => {
    if (activePatient) loadMessages(activePatient);
  }, [activePatient, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-sms-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_messages' }, (payload) => {
        const msg = payload.new as any;
        setMessages(prev => [...prev, { id: msg.id, direction: msg.direction, body: msg.body, created_at: msg.created_at }]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSend = async () => {
    if (!newMessage.trim() || !activePatient) return;
    setIsSending(true);
    try {
      const phone = activePatient.phone.startsWith('+') ? activePatient.phone : `+1${activePatient.phone.replace(/\D/g, '')}`;
      const { error } = await supabase.functions.invoke('send-sms-notification', {
        body: { phoneNumber: phone, notificationType: 'custom', customMessage: newMessage.trim() },
      });
      if (error) throw error;
      setMessages(prev => [...prev, { id: crypto.randomUUID(), direction: 'outbound', body: newMessage.trim(), created_at: new Date().toISOString() }]);
      setNewMessage('');
      toast.success(`Sent to ${activePatient.name}`);
    } catch (err) {
      console.error('Send error:', err);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleComposeSend = async () => {
    if (!newMessage.trim() || !composePhone.trim()) return;
    setIsSending(true);
    try {
      const phone = composePhone.startsWith('+') ? composePhone : `+1${composePhone.replace(/\D/g, '')}`;
      const { error } = await supabase.functions.invoke('send-sms-notification', {
        body: { phoneNumber: phone, notificationType: 'custom', customMessage: newMessage.trim() },
      });
      if (error) throw error;
      toast.success(`Sent to ${composeName || composePhone}`);
      setNewMessage('');
      setShowCompose(false);
      setComposePhone('');
      setComposeName('');
      fetchData();
    } catch (err) {
      toast.error('Failed to send');
    } finally {
      setIsSending(false);
    }
  };

  // Filter conversations
  const filteredConvos = useMemo(() => {
    let list = filter === 'unread' ? conversations.filter(c => c.unread) : conversations;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        c.patient.name.toLowerCase().includes(q) ||
        c.patient.phone.includes(q) ||
        (c.patient.email && c.patient.email.toLowerCase().includes(q))
      );
    }
    return list;
  }, [conversations, filter, searchQuery]);

  // For "All" filter — show patients without conversations too
  const allContactsFiltered = useMemo(() => {
    if (filter !== 'all') return [];
    let list = patients.filter(p => !conversations.find(c => c.patient.id === p.id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q));
    }
    return list;
  }, [patients, conversations, filter, searchQuery]);

  const selectPatient = (p: PatientContact) => {
    setActivePatient(p);
    setMobileShowThread(true);
    setMobileShowContext(false);
  };

  const initials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : (parts[0]?.[0] || '?').toUpperCase();
  };

  const upcoming = patientAppts.filter(a => ['scheduled', 'confirmed'].includes(a.status));
  const past = patientAppts.filter(a => ['completed', 'specimen_delivered'].includes(a.status));

  return (
    <div className="flex h-[calc(100vh-100px)] md:h-[calc(100vh-80px)] border rounded-lg overflow-hidden bg-white">

      {/* ======= COLUMN 1: Conversation List ======= */}
      <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col bg-white flex-shrink-0 ${mobileShowThread ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold">Messages</h1>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowCompose(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search Inbox" className="pl-9 h-9 text-sm bg-gray-50" />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b">
          <button onClick={() => setFilter('inbox')} className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${filter === 'inbox' ? 'bg-[#1e293b] text-white border-[#1e293b]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            Inbox
          </button>
          <button onClick={() => setFilter('unread')} className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${filter === 'unread' ? 'bg-[#1e293b] text-white border-[#1e293b]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            Unread
          </button>
          <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${filter === 'all' ? 'bg-[#1e293b] text-white border-[#1e293b]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            All Patients
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : (
            <>
              {filteredConvos.map((c) => (
                <div
                  key={c.patient.id}
                  onClick={() => selectPatient(c.patient)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b transition-colors ${
                    activePatient?.id === c.patient.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-gray-600">
                    {initials(c.patient.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${c.unread ? 'font-bold' : 'font-medium'}`}>{c.patient.name}</p>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {formatDistanceToNow(new Date(c.lastMessageAt), { addSuffix: false }).replace('about ', '')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {c.lastDirection === 'outbound' ? 'You: ' : ''}{c.lastMessage}
                    </p>
                  </div>
                  {c.unread && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />}
                </div>
              ))}

              {/* All patients without conversations */}
              {filter === 'all' && allContactsFiltered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => selectPatient(p)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b transition-colors ${
                    activePatient?.id === p.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-gray-600">
                    {initials(p.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.phone}</p>
                  </div>
                </div>
              ))}

              {filteredConvos.length === 0 && allContactsFiltered.length === 0 && (
                <div className="py-12 text-center">
                  <Inbox className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{searchQuery ? 'No results' : 'No conversations yet'}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ======= COLUMN 2: Message Thread ======= */}
      <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowThread && !activePatient ? 'hidden md:flex' : mobileShowThread ? 'flex' : 'hidden md:flex'}`}>
        {showCompose ? (
          /* Compose new message */
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => { setShowCompose(false); setMobileShowThread(false); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 hidden md:flex" onClick={() => setShowCompose(false)}>
                <X className="h-4 w-4" />
              </Button>
              <h2 className="font-semibold">New Message</h2>
            </div>
            <div className="p-4 border-b space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium w-12">To:</label>
                <Input value={composeName} onChange={e => setComposeName(e.target.value)} placeholder="Name" className="h-9 text-sm flex-1" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium w-12">Phone:</label>
                <Input value={composePhone} onChange={e => setComposePhone(e.target.value)} placeholder="(555) 000-0000" className="h-9 text-sm flex-1" type="tel" />
              </div>
            </div>
            <div className="flex-1" />
            <div className="border-t p-3 flex gap-2">
              <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Send via text" className="flex-1 h-10"
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleComposeSend()} />
              <Button onClick={handleComposeSend} disabled={isSending || !newMessage.trim() || !composePhone.trim()}
                className="bg-[#B91C1C] hover:bg-[#991B1B] text-white h-10 px-4">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : activePatient ? (
          <div className="flex flex-col h-full">
            {/* Thread header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-white">
              <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => { setMobileShowThread(false); setActivePatient(null); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base">{activePatient.name}</p>
                <p className="text-xs text-muted-foreground">{activePatient.phone}</p>
              </div>
              <span className="text-xs text-muted-foreground hidden sm:block">ConveLabs</span>
              <Button variant="ghost" size="sm" className="lg:hidden text-xs" onClick={() => setMobileShowContext(!mobileShowContext)}>
                <User className="h-4 w-4" />
              </Button>
            </div>

            {/* Mobile context panel (overlay) */}
            {mobileShowContext && (
              <div className="lg:hidden border-b bg-gray-50 p-4 space-y-3 max-h-[40vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">Customer Info</p>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMobileShowContext(false)}><X className="h-3 w-3" /></Button>
                </div>
                {activePatient.email && <p className="text-sm text-blue-600">{activePatient.email}</p>}
                <p className="text-sm">{activePatient.phone}</p>
                <p className="text-xs text-muted-foreground">{totalTransactions} transactions | ${totalSpent.toFixed(2)} spent</p>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-white">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No messages yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Send a message to start the conversation</p>
                </div>
              )}

              {messages.map((msg, i) => {
                const prevMsg = messages[i - 1];
                const showDate = !prevMsg || format(new Date(msg.created_at), 'MMM d, yyyy') !== format(new Date(prevMsg.created_at), 'MMM d, yyyy');
                return (
                  <React.Fragment key={msg.id}>
                    {showDate && (
                      <div className="text-center py-3">
                        <span className="text-[11px] text-muted-foreground bg-white px-2">
                          {format(new Date(msg.created_at), 'MMMM d, yyyy')} at {format(new Date(msg.created_at), 'h:mm a')}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'} mb-1`}>
                      {msg.direction === 'inbound' && (
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mr-2 mt-auto text-xs font-semibold text-gray-500">
                          {initials(activePatient.name)}
                        </div>
                      )}
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                        msg.direction === 'outbound'
                          ? 'bg-blue-600 text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-800 rounded-bl-md'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                        {!showDate && (
                          <p className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-blue-200' : 'text-gray-400'}`}>
                            {format(new Date(msg.created_at), 'h:mm a')}
                          </p>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t bg-white p-3 flex gap-2 items-center">
              <Input
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Send via text"
                className="flex-1 h-10 text-sm"
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              />
              <Button
                onClick={handleSend}
                disabled={isSending || !newMessage.trim()}
                size="icon"
                className="h-10 w-10 bg-[#B91C1C] hover:bg-[#991B1B] text-white rounded-lg"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8 text-gray-300" />
            </div>
            <h3 className="font-semibold text-gray-700 mb-1">Select a conversation</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Choose a conversation from the left or start a new one
            </p>
          </div>
        )}
      </div>

      {/* ======= COLUMN 3: Customer Context (desktop only) ======= */}
      {activePatient && !showCompose && (
        <div className="hidden lg:flex w-72 xl:w-80 border-l flex-col bg-white flex-shrink-0 overflow-y-auto">
          {/* Contact info */}
          <div className="p-4 border-b">
            {activePatient.email && (
              <a href={`mailto:${activePatient.email}`} className="text-sm text-blue-600 hover:underline block font-medium">{activePatient.email}</a>
            )}
            <p className="text-sm text-gray-700 mt-1">{activePatient.phone}</p>
            {activePatient.address && (
              <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                {activePatient.address}{activePatient.city ? `, ${activePatient.city}` : ''}{activePatient.state ? `, ${activePatient.state}` : ''}
              </p>
            )}
          </div>

          {/* Revenue summary — Hormozi: always show the money */}
          <div className="px-4 py-3 border-b">
            <p className="text-sm">
              <span className="font-semibold text-blue-700">{totalTransactions} transactions</span>
              <span className="text-muted-foreground mx-2">|</span>
              <span className="font-semibold text-emerald-700">${totalSpent.toFixed(2)} spent</span>
            </p>
          </div>

          {/* Upcoming appointments */}
          {upcoming.length > 0 && (
            <div className="p-4 border-b">
              <p className="text-sm font-bold mb-3">Upcoming appointments</p>
              {upcoming.map(a => (
                <div key={a.id} className="flex items-start gap-2 mb-3 last:mb-0">
                  <Calendar className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">
                      {(a.service_name || a.service_type || 'Blood Work').replace(/_|-/g, ' ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.appointment_date?.substring(0, 10) ? format(new Date(a.appointment_date.substring(0, 10) + 'T12:00:00'), 'MMM d, yyyy') : ''}
                      {a.appointment_time ? `, ${a.appointment_time}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-0.5" />
                </div>
              ))}
            </div>
          )}

          {/* Previous appointments */}
          <div className="p-4">
            <p className="text-sm font-bold mb-3">Previous appointments</p>
            {past.length === 0 ? (
              <p className="text-xs text-muted-foreground">No previous appointments</p>
            ) : (
              past.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-start gap-2 mb-3 last:mb-0">
                  <Calendar className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">
                      {(a.service_name || a.service_type || 'Blood Work').replace(/_|-/g, ' ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.appointment_date?.substring(0, 10) ? format(new Date(a.appointment_date.substring(0, 10) + 'T12:00:00'), 'MMM d, yyyy') : ''}
                      {a.appointment_time ? `, ${a.appointment_time}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-0.5" />
                </div>
              ))
            )}
            {past.length > 5 && (
              <button className="text-xs text-blue-600 hover:underline mt-1">View all</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SMSMessagingTab;
