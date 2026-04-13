import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  MessageSquare, Send, ArrowLeft, Loader2, User, Phone,
  Search, RefreshCw, Plus, UserPlus,
} from 'lucide-react';
import { toast } from '@/components/ui/sonner';

interface PatientContact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  lastAppointment: string | null;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  created_at: string;
}

const SMSMessagingTab: React.FC = () => {
  const [patients, setPatients] = useState<PatientContact[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<PatientContact[]>([]);
  const [activePatient, setActivePatient] = useState<PatientContact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [newRecipientPhone, setNewRecipientPhone] = useState('');
  const [newRecipientName, setNewRecipientName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch all patients with phone numbers from tenant_patients
  const fetchPatients = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: patientData, error } = await supabase
        .from('tenant_patients')
        .select('id, first_name, last_name, phone, email')
        .order('first_name', { ascending: true });

      if (error) {
        console.error('Failed to load patients:', error);
      }
      console.log('Patients loaded:', patientData?.length || 0);

      if (error) throw error;

      const contactList: PatientContact[] = (patientData || [])
        .map((p: any) => ({
          id: p.id,
          name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown',
          phone: p.phone,
          email: p.email,
          lastAppointment: null,
        }));

      setPatients(contactList);
      setFilteredPatients(contactList);
    } catch (err) {
      console.error('Error loading patients:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  // Filter patients by search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredPatients(patients);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredPatients(
        patients.filter(p =>
          p.name.toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          (p.email && p.email.toLowerCase().includes(q))
        )
      );
    }
  }, [searchQuery, patients]);

  // Load SMS history for a patient from sms_notifications table (existing Twilio messages)
  const loadMessages = useCallback(async (patient: PatientContact) => {
    try {
      // Try sms_messages table first (from conversations)
      const { data: convMsgs } = await supabase
        .from('sms_messages' as any)
        .select('*')
        .order('created_at', { ascending: true });

      // Also try sms_notifications (existing outbound messages)
      const { data: notifMsgs } = await supabase
        .from('sms_notifications' as any)
        .select('*')
        .order('created_at', { ascending: true });

      const allMessages: Message[] = [];

      // Add messages from sms_messages
      if (convMsgs) {
        (convMsgs as any[]).forEach((m: any) => {
          allMessages.push({
            id: m.id,
            direction: m.direction || 'outbound',
            body: m.body || m.message_content || '',
            created_at: m.created_at,
          });
        });
      }

      // Add messages from sms_notifications (all outbound)
      if (notifMsgs) {
        (notifMsgs as any[]).forEach((m: any) => {
          // Only include notifications for this patient's phone
          if (m.phone_number === patient.phone || m.phone_number === `+1${patient.phone.replace(/\D/g, '')}`) {
            allMessages.push({
              id: m.id,
              direction: 'outbound',
              body: m.message_content || '',
              created_at: m.created_at,
            });
          }
        });
      }

      // Sort by date and dedupe
      allMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setMessages(allMessages);
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    if (activePatient) loadMessages(activePatient);
  }, [activePatient, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Subscribe to new messages
  useEffect(() => {
    const channel = supabase
      .channel('admin-sms-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_messages' }, (payload) => {
        const msg = payload.new as any;
        setMessages(prev => [...prev, {
          id: msg.id,
          direction: msg.direction,
          body: msg.body,
          created_at: msg.created_at,
        }]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSend = async (phone: string, name: string) => {
    if (!newMessage.trim()) return;
    setIsSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-sms-notification', {
        body: {
          phoneNumber: phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`,
          notificationType: 'custom',
          customMessage: newMessage.trim(),
        },
      });
      if (error) throw error;

      const msg: Message = {
        id: crypto.randomUUID(),
        direction: 'outbound',
        body: newMessage.trim(),
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, msg]);
      setNewMessage('');
      toast.success(`Message sent to ${name}`);
    } catch (err) {
      console.error('Send error:', err);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendToNew = async () => {
    if (!newMessage.trim() || !newRecipientPhone.trim()) return;
    setIsSending(true);
    try {
      const phone = newRecipientPhone.startsWith('+') ? newRecipientPhone : `+1${newRecipientPhone.replace(/\D/g, '')}`;
      const { error } = await supabase.functions.invoke('send-sms-notification', {
        body: {
          phoneNumber: phone,
          notificationType: 'custom',
          customMessage: newMessage.trim(),
        },
      });
      if (error) throw error;
      toast.success(`Message sent to ${newRecipientName || newRecipientPhone}`);
      setNewMessage('');
      setShowNewMessage(false);
      setNewRecipientPhone('');
      setNewRecipientName('');
    } catch (err) {
      console.error('Send error:', err);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  // Chat view
  if (activePatient) {
    return (
      <div className="h-[calc(100vh-120px)] flex flex-col">
        <div className="flex items-center gap-3 pb-3 border-b mb-3">
          <Button variant="ghost" size="sm" onClick={() => setActivePatient(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="w-10 h-10 rounded-full bg-[#B91C1C]/10 flex items-center justify-center">
            <User className="h-5 w-5 text-[#B91C1C]" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">{activePatient.name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" /> {activePatient.phone}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 px-2">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-muted-foreground">No messages yet. Send a message to start.</p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                msg.direction === 'outbound'
                  ? 'bg-[#B91C1C] text-white rounded-br-md'
                  : 'bg-gray-100 text-gray-800 rounded-bl-md'
              }`}>
                <p className="text-sm">{msg.body}</p>
                <p className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-red-200' : 'text-gray-400'}`}>
                  {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t pt-3 mt-3 flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend(activePatient.phone, activePatient.name)}
          />
          <Button
            className="bg-[#B91C1C] hover:bg-[#991B1B] text-white px-4"
            onClick={() => handleSend(activePatient.phone, activePatient.name)}
            disabled={isSending || !newMessage.trim()}
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    );
  }

  // New message compose
  if (showNewMessage) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setShowNewMessage(false)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-bold">New Message</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Recipient Name</label>
            <Input value={newRecipientName} onChange={e => setNewRecipientName(e.target.value)} placeholder="Patient name" />
          </div>
          <div>
            <label className="text-sm font-medium">Phone Number *</label>
            <Input value={newRecipientPhone} onChange={e => setNewRecipientPhone(e.target.value)} placeholder="+1 (555) 000-0000" type="tel" />
          </div>
          <div>
            <label className="text-sm font-medium">Message *</label>
            <Input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              onKeyDown={e => e.key === 'Enter' && handleSendToNew()}
            />
          </div>
          <Button
            className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-2"
            onClick={handleSendToNew}
            disabled={isSending || !newMessage.trim() || !newRecipientPhone.trim()}
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Send Message</>}
          </Button>
        </div>
      </div>
    );
  }

  // Patient list with search
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[#B91C1C]" />
          SMS Messages
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowNewMessage(true)} className="gap-1">
            <Plus className="h-4 w-4" /> New Message
          </Button>
          <Button variant="outline" size="sm" onClick={fetchPatients} className="gap-1">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search patients by name, phone, or email..."
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-[#B91C1C]">{patients.length}</p>
            <p className="text-xs text-muted-foreground">Patients</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{patients.filter(p => p.phone).length}</p>
            <p className="text-xs text-muted-foreground">With Phone</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{patients.filter(p => p.email).length}</p>
            <p className="text-xs text-muted-foreground">With Email</p>
          </CardContent>
        </Card>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
        </div>
      )}

      {!isLoading && filteredPatients.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-800 mb-1">
              {searchQuery ? 'No patients match your search' : 'No patients with phone numbers'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'Try a different search term.' : 'Patient phone numbers will appear here when added.'}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {filteredPatients.map((patient) => (
          <Card
            key={patient.id}
            className="shadow-sm cursor-pointer hover:shadow-md transition-all hover:border-[#B91C1C]/30"
            onClick={() => setActivePatient(patient)}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-[#B91C1C]/10 flex items-center justify-center">
                <User className="h-5 w-5 text-[#B91C1C]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{patient.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {patient.phone}
                </p>
              </div>
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={(e) => { e.stopPropagation(); setActivePatient(patient); }}>
                <MessageSquare className="h-3 w-3" /> Message
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default SMSMessagingTab;
