/**
 * ChatThreadPage — /c/:token
 *
 * The page the owner lands on from the Nicobot SMS link. Token-authed (no admin
 * login): loads the visitor's conversation, shows every message, and lets the
 * owner reply. The reply is delivered to the visitor live (widget), by SMS, and
 * by email (whatever contact was captured). Polls for the visitor's replies.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Send, AlertTriangle, Phone, Mail, MapPin, User } from 'lucide-react';

const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const ANON = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || '';

interface Msg { id: string; role: string; content: string; created_at: string; delivered_via?: string | null; }
interface Conv {
  id: string; captured_name?: string | null; captured_email?: string | null; captured_phone?: string | null;
  captured_zip?: string | null; lead_path?: string | null; status?: string | null; handoff_state?: string | null; started_at?: string;
}

const ChatThreadPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conv, setConv] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const headers = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': `Bearer ${ANON}` };

  const load = useCallback(async (initial = false) => {
    if (!token) { setError('No link token.'); setLoading(false); return; }
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-thread?token=${encodeURIComponent(token)}`, { headers });
      const j = await res.json();
      if (!res.ok) { if (initial) setError(j.error === 'expired' ? 'This link has expired.' : 'Conversation not found.'); return; }
      setConv(j.conversation);
      setMessages(j.messages || []);
    } catch (e: any) { if (initial) setError(e?.message || 'Could not load.'); }
    finally { if (initial) setLoading(false); }
  }, [token]);

  useEffect(() => { load(true); }, [load]);
  // Poll for the visitor's replies every 5s
  useEffect(() => {
    const t = setInterval(() => load(false), 5000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = reply.trim();
    if (!body || sending) return;
    setSending(true);
    // optimistic
    const optimistic: Msg = { id: `tmp-${Date.now()}`, role: 'human', content: body, created_at: new Date().toISOString() };
    setMessages(m => [...m, optimistic]);
    setReply('');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-thread`, { method: 'POST', headers, body: JSON.stringify({ token, body }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error || 'Send failed.'); setMessages(m => m.filter(x => x.id !== optimistic.id)); }
      else { await load(false); }
    } catch (e: any) { setError(e?.message || 'Send failed.'); }
    finally { setSending(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="h-7 w-7 animate-spin text-[#B91C1C]" /></div>;
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full bg-white border rounded-2xl p-6 text-center shadow-sm">
        <AlertTriangle className="h-9 w-9 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-gray-700">{error}</p>
      </div>
    </div>
  );

  const name = conv?.captured_name || 'Website visitor';
  const channels = (m: Msg) => m.delivered_via ? ` · sent via ${m.delivered_via.replace(/\+/g, ', ')}` : '';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="font-semibold">{name}</span>
            {conv?.lead_path && <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5 uppercase tracking-wide">{conv.lead_path}</span>}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] opacity-90">
            {conv?.captured_phone && <a href={`tel:${conv.captured_phone}`} className="flex items-center gap-1 underline"><Phone className="h-3 w-3" />{conv.captured_phone}</a>}
            {conv?.captured_email && <a href={`mailto:${conv.captured_email}`} className="flex items-center gap-1 underline"><Mail className="h-3 w-3" />{conv.captured_email}</a>}
            {conv?.captured_zip && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{conv.captured_zip}</span>}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-2">
          {messages.length === 0 && <p className="text-center text-sm text-gray-400 py-8">No messages yet.</p>}
          {messages.map(m => {
            const mine = m.role === 'human';
            const isAI = m.role === 'assistant';
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                  mine ? 'bg-[#B91C1C] text-white' : isAI ? 'bg-white border border-gray-200 text-gray-700' : 'bg-gray-200 text-gray-900'
                }`}>
                  <div className="text-[10px] opacity-70 mb-0.5">{mine ? 'You' : isAI ? 'Nico-bot' : name}</div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {mine && <div className="text-[9px] opacity-70 mt-0.5">{channels(m)}</div>}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>

      {/* Composer */}
      <form onSubmit={send} className="border-t bg-white px-4 py-3 sticky bottom-0">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder={`Reply to ${conv?.captured_name || 'the visitor'}…`}
            className="flex-1 border border-gray-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/40"
          />
          <button type="submit" disabled={sending || !reply.trim()} className="bg-[#B91C1C] hover:bg-[#991B1B] disabled:opacity-50 text-white rounded-full w-11 h-11 flex items-center justify-center flex-shrink-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="max-w-2xl mx-auto text-[10px] text-gray-400 mt-1.5 text-center">
          Your reply reaches them live in chat{conv?.captured_phone ? ', by text' : ''}{conv?.captured_email ? ', and by email' : ''}.
        </p>
      </form>
    </div>
  );
};

export default ChatThreadPage;
