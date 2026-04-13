import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import {
  MessageSquare, ArrowLeft, Send, Loader2, User, Phone,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Build conversations from appointments with phone numbers
  useEffect(() => {
    const patientMap = new Map<string, Conversation>();

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

    setConversations(Array.from(patientMap.values()));
    setIsLoading(false);
  }, [appointments]);

  // Load messages for active conversation from sms_notifications or sms_messages
  const loadMessages = useCallback(async (conv: Conversation) => {
    try {
      // Try loading from sms_messages table first
      const { data, error } = await supabase
        .from('sms_messages' as any)
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(
          (data as any[]).map((m: any) => ({
            id: m.id,
            direction: m.direction,
            body: m.body,
            created_at: m.created_at,
          }))
        );
      } else {
        // Fallback: no messages yet
        setMessages([]);
      }
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

  // Conversation List
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare className="h-5 w-5 text-[#B91C1C]" />
        <h2 className="text-lg font-bold">Messages</h2>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
        </div>
      )}

      {!isLoading && conversations.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-dashed p-8 text-center">
          <MessageSquare className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-800 mb-1">No conversations</h3>
          <p className="text-sm text-muted-foreground">Patient conversations will appear here when you have appointments with phone numbers on file.</p>
        </div>
      )}

      {conversations.map((conv) => (
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
