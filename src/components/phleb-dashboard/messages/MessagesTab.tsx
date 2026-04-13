import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import {
  MessageSquare, ArrowLeft, Send, Loader2, User, Phone, Plus, Search,
} from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { PhlebAppointment } from '@/hooks/usePhlebotomistAppointments';

interface Conversation {
  id: string;
  patient_id: string;
  patient_phone: string;
  patient_name: string;
  last_message: string;
  last_message_at: string;
  unread: boolean;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  created_at: string;
}

interface MessagesTabProps {
  appointments: PhlebAppointment[];
}

const MessagesTab: React.FC<MessagesTabProps> = ({ appointments }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [composePhone, setComposePhone] = useState('');
  const [composeName, setComposeName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [allPatients, setAllPatients] = useState<Conversation[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Build conversations from appointments + fetch all patients with phones
  useEffect(() => {
    const load = async () => {
      const patientMap = new Map<string, Conversation>();

      // From appointments
      appointments.forEach(appt => {
        if (appt.patient_phone && appt.patient_id && !patientMap.has(appt.patient_id)) {
          patientMap.set(appt.patient_id, {
            id: appt.patient_id,
            patient_id: appt.patient_id,
            patient_phone: appt.patient_phone,
            patient_name: appt.patient_name,
            last_message: `${appt.service_type?.replace(/_/g, ' ')} - ${appt.appointment_date}`,
            last_message_at: appt.appointment_date,
            unread: false,
          });
        }
      });

      // Also fetch all patients with phone numbers from tenant_patients
      const { data: patients } = await supabase
        .from('tenant_patients')
        .select('id, first_name, last_name, phone, email')
        .not('phone', 'is', null)
        .order('first_name', { ascending: true });

      (patients || []).forEach((p: any) => {
        if (p.phone && p.phone.trim() && !patientMap.has(p.id)) {
          patientMap.set(p.id, {
            id: p.id,
            patient_id: p.id,
            patient_phone: p.phone,
            patient_name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown',
            last_message: p.email || 'Patient',
            last_message_at: new Date().toISOString(),
            unread: false,
          });
        }
      });

      const all = Array.from(patientMap.values());
      setConversations(all);
      setAllPatients(all);
      setIsLoading(false);
    };
    load();
  }, [appointments]);

  // Load messages for a specific patient conversation filtered by phone
  const loadMessages = useCallback(async (conv: Conversation) => {
    try {
      const allMsgs: Message[] = [];
      const normalizedPhone = conv.patient_phone.replace(/\D/g, '');
      const phoneVariants = [conv.patient_phone, `+1${normalizedPhone}`, normalizedPhone];

      // Load from sms_notifications (outbound messages sent to this patient)
      const { data: notifs } = await supabase
        .from('sms_notifications' as any)
        .select('*')
        .order('created_at', { ascending: true });

      if (notifs) {
        (notifs as any[]).forEach((m: any) => {
          const msgPhone = (m.phone_number || '').replace(/\D/g, '');
          if (phoneVariants.some(p => p.replace(/\D/g, '') === msgPhone)) {
            allMsgs.push({
              id: m.id,
              direction: 'outbound',
              body: m.message_content || '',
              created_at: m.created_at,
            });
          }
        });
      }

      // Load from sms_messages (conversation-based messages)
      const { data: convMsgs } = await supabase
        .from('sms_messages' as any)
        .select('*')
        .order('created_at', { ascending: true });

      if (convMsgs) {
        (convMsgs as any[]).forEach((m: any) => {
          allMsgs.push({
            id: m.id,
            direction: m.direction || 'outbound',
            body: m.body || '',
            created_at: m.created_at,
          });
        });
      }

      // Sort by date, dedupe by ID
      const seen = new Set<string>();
      const unique = allMsgs
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });

      setMessages(unique);
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    if (activeConversation) {
      loadMessages(activeConversation);
    }
  }, [activeConversation, loadMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeConversation) return;
    setIsSending(true);

    try {
      // Send via Twilio
      const { error } = await supabase.functions.invoke('send-sms-notification', {
        body: {
          phoneNumber: activeConversation.patient_phone,
          notificationType: 'custom',
          customMessage: newMessage.trim(),
        },
      });

      if (error) throw error;

      // Add to local messages
      const newMsg: Message = {
        id: crypto.randomUUID(),
        direction: 'outbound',
        body: newMessage.trim(),
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, newMsg]);
      setNewMessage('');
      toast.success('Message sent');
    } catch (err) {
      console.error('Send error:', err);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  // Chat View
  if (activeConversation) {
    return (
      <div className="flex flex-col h-[calc(100vh-180px)]">
        {/* Chat Header */}
        <div className="flex items-center gap-3 pb-3 border-b">
          <Button variant="ghost" size="sm" className="p-1" onClick={() => setActiveConversation(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="w-9 h-9 rounded-full bg-[#B91C1C]/10 flex items-center justify-center">
            <User className="h-4 w-4 text-[#B91C1C]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{activeConversation.patient_name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" /> {activeConversation.patient_phone}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <MessageSquare className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No messages yet. Send a message to start the conversation.</p>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  msg.direction === 'outbound'
                    ? 'bg-[#B91C1C] text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}
              >
                <p className="text-sm">{msg.body}</p>
                <p className={`text-[10px] mt-1 ${
                  msg.direction === 'outbound' ? 'text-red-200' : 'text-gray-400'
                }`}>
                  {format(new Date(msg.created_at), 'h:mm a')}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t pt-3 flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
          />
          <Button
            className="bg-[#B91C1C] hover:bg-[#991B1B] text-white px-4"
            onClick={handleSendMessage}
            disabled={isSending || !newMessage.trim()}
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    );
  }

  // Handle compose send
  const handleComposeSend = async () => {
    if (!newMessage.trim() || !composePhone.trim()) return;
    setIsSending(true);
    try {
      const phone = composePhone.startsWith('+') ? composePhone : `+1${composePhone.replace(/\D/g, '')}`;
      const { error } = await supabase.functions.invoke('send-sms-notification', {
        body: { phoneNumber: phone, notificationType: 'custom', customMessage: newMessage.trim() },
      });
      if (error) throw error;
      toast.success(`Message sent to ${composeName || composePhone}`);
      setNewMessage('');
      setShowCompose(false);
      setComposePhone('');
      setComposeName('');
    } catch (err) {
      console.error('Compose send error:', err);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const filteredConversations = searchQuery.trim()
    ? conversations.filter(c =>
        c.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.patient_phone.includes(searchQuery)
      )
    : conversations;

  // Compose new message
  if (showCompose) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setShowCompose(false)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-bold">New Message</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Recipient Name</label>
            <Input value={composeName} onChange={e => setComposeName(e.target.value)} placeholder="Patient name" />
          </div>
          <div>
            <label className="text-sm font-medium">Phone Number *</label>
            <Input value={composePhone} onChange={e => setComposePhone(e.target.value)} placeholder="+1 (555) 000-0000" type="tel" />
          </div>
          <div>
            <label className="text-sm font-medium">Message *</label>
            <Input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              onKeyDown={e => e.key === 'Enter' && handleComposeSend()}
            />
          </div>
          <Button
            className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-2"
            onClick={handleComposeSend}
            disabled={isSending || !newMessage.trim() || !composePhone.trim()}
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Send Message</>}
          </Button>
        </div>
      </div>
    );
  }

  // Conversation List
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[#B91C1C]" />
          <h2 className="text-lg font-bold">Messages</h2>
        </div>
        <Button
          size="sm"
          className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1"
          onClick={() => setShowCompose(true)}
        >
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search patients..."
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
        </div>
      )}

      {!isLoading && filteredConversations.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-dashed p-8 text-center">
          <MessageSquare className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-800 mb-1">{searchQuery ? 'No results' : 'No conversations'}</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery ? 'Try a different search.' : 'Tap "New" to send a message to a patient.'}
          </p>
        </div>
      )}

      {filteredConversations.map((conv) => (
        <Card
          key={conv.id}
          className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setActiveConversation(conv)}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#B91C1C]/10 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-[#B91C1C]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{conv.patient_name}</p>
              <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-muted-foreground">{conv.patient_phone}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default MessagesTab;
