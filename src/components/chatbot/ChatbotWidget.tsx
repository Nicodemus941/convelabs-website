import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, X, Send, Loader2, Sparkles, Heart, Building2, Link as LinkIcon, Phone, ExternalLink, Crown } from 'lucide-react';
import { trackEvent } from '@/lib/posthog';

/**
 * ChatbotWidget — "Ask Nico" landing-page assistant.
 *
 * Floats in the bottom-right as a red bubble. Click → opens chat window
 * with a 3-button welcome (Hormozi Layer 1 hook). User picks one, the
 * widget routes that choice to the chatbot edge function as the first
 * real message, and the conversation proceeds naturally.
 *
 * State persisted in localStorage:
 *   convelabs_chat_visitor_id    → stable across sessions (one UUID forever)
 *   convelabs_chat_conversation_id → per-conversation (cleared on close)
 *
 * Why not Supabase auth? Visitors are anonymous. visitor_id lets us
 * correlate multiple sessions from the same person without PII.
 */

interface ChatMessage {
  role: 'user' | 'assistant' | 'human';   // 'human' = Nico replying personally (staff takeover)
  content: string;
  suggestedActions?: Array<{ label: string; url: string }>;
  escalated?: boolean;
  ts: number;
  dbId?: string;
}

const LS_VISITOR_KEY = 'convelabs_chat_visitor_id';
const LS_CONVO_KEY = 'convelabs_chat_conversation_id';
const LS_SEEN_WELCOME_KEY = 'convelabs_chat_seen_welcome';

const SB_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SB_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || '';

function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = window.localStorage.getItem(LS_VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(LS_VISITOR_KEY, id);
  }
  return id;
}

// Welcome hook — Hormozi Layer 1
// Order = revenue priority: VIP first (highest LTV), then patient (most volume),
// then doctor-link (already-converted), then provider (B2B).
const HOOK_OPTIONS: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; intentMessage: string; leadPath: 'patient' | 'provider' | 'lab_request' | 'vip' }> = [
  {
    icon: Crown,
    label: 'Tell me about VIP membership',
    intentMessage: 'Tell me about VIP membership and the Founding 50',
    leadPath: 'vip',
  },
  {
    icon: Heart,
    label: 'I need labs drawn at home',
    intentMessage: 'I need labs drawn at home',
    leadPath: 'patient',
  },
  {
    icon: LinkIcon,
    label: 'I got a link from my doctor',
    intentMessage: 'My doctor sent me a link to book through ConveLabs',
    leadPath: 'lab_request',
  },
  {
    icon: Building2,
    label: "I'm a provider/practice",
    intentMessage: "I'm a provider looking into partnering with ConveLabs",
    leadPath: 'provider',
  },
];

const ChatbotWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [hookPicked, setHookPicked] = useState<boolean>(false);
  const [hasUnread, setHasUnread] = useState(false);
  // Proactive greeting bubble — a friendly speech bubble that pops next to the
  // launcher on first visit to invite engagement (vs. waiting for a click).
  const [showGreeting, setShowGreeting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const visitorId = useMemo(() => getOrCreateVisitorId(), []);
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(LS_CONVO_KEY);
  });

  // Smart auto-scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sending]);

  // Proactive engagement on first visit (only if they've never opened it):
  //   • 10s → pop a greeting speech-bubble inviting a chat
  //   • 15s → also light the unread dot
  // Both are suppressed once the visitor has seen/opened the widget.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(LS_SEEN_WELCOME_KEY);
    if (seen) return;
    const tGreeting = setTimeout(() => {
      setShowGreeting(true);
      trackEvent('chatbot_greeting_shown', { path: window.location.pathname });
    }, 10000);
    const tDot = setTimeout(() => setHasUnread(true), 15000);
    return () => { clearTimeout(tGreeting); clearTimeout(tDot); };
  }, []);

  const dismissGreeting = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowGreeting(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_SEEN_WELCOME_KEY, '1');
    }
  };

  const toggleOpen = () => {
    const willOpen = !open;
    setOpen(willOpen);
    setHasUnread(false);
    setShowGreeting(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_SEEN_WELCOME_KEY, '1');
    }
    // Fire an "opened" funnel event so we can separate opens from messages
    // sent vs. leads captured (PostHog → no-op if VITE_POSTHOG_KEY unset).
    if (willOpen) {
      trackEvent('chatbot_opened', {
        path: typeof window !== 'undefined' ? window.location.pathname : null,
        visitor_id: visitorId,
        conversation_id: conversationId,
        had_greeting: showGreeting,
      });
    }
  };

  const persistConversationId = (id: string) => {
    setConversationId(id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_CONVO_KEY, id);
    }
  };

  // ── Contact capture ("leave your info so Nico can follow up") ──
  const [showContact, setShowContact] = useState(false);
  const [contactDone, setContactDone] = useState(false);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cEmail, setCEmail] = useState('');

  const submitContact = async () => {
    if (!cName.trim() && !cPhone.trim() && !cEmail.trim()) return;
    setContactDone(true);
    setShowContact(false);
    setMessages(prev => [...prev, { role: 'human', content: `Thanks${cName ? `, ${cName.split(' ')[0]}` : ''}! Nico will follow up personally — you'll hear back here, and by text/email too.`, ts: Date.now() }]);
    try {
      await supabase.functions.invoke('chatbot', {
        body: {
          visitorId, conversationId,
          message: '[contact submitted]',
          contact: { name: cName.trim() || null, phone: cPhone.trim() || null, email: cEmail.trim() || null },
          landingUrl: window.location.pathname,
        },
      });
    } catch { /* non-blocking — owner still gets pinged on next poll/escalation */ }
  };

  // ── Poll for staff (human) replies while the widget is open ──
  const seenHumanIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!open || !conversationId || !SB_KEY) return;
    let active = true;
    const poll = async () => {
      try {
        const r = await fetch(`${SB_URL}/functions/v1/chatbot?conversationId=${encodeURIComponent(conversationId)}&visitorId=${encodeURIComponent(visitorId)}`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        });
        const j = await r.json();
        if (!active || !Array.isArray(j?.messages)) return;
        const fresh = j.messages.filter((m: any) => m.role === 'human' && !seenHumanIds.current.has(m.id));
        if (fresh.length) {
          fresh.forEach((m: any) => seenHumanIds.current.add(m.id));
          setMessages(prev => [...prev, ...fresh.map((m: any) => ({ role: 'human' as const, content: m.content, ts: Date.parse(m.created_at) || Date.now(), dbId: m.id }))]);
          if (!open) setHasUnread(true);
        }
      } catch { /* transient */ }
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => { active = false; clearInterval(t); };
  }, [open, conversationId, visitorId]);

  const sendToBackend = async (message: string, leadPath?: 'patient' | 'provider' | 'lab_request') => {
    setSending(true);
    try {
      const utm = new URLSearchParams(window.location.search);
      const { data, error } = await supabase.functions.invoke('chatbot', {
        body: {
          visitorId,
          conversationId,
          message,
          leadPath: leadPath || null,
          landingUrl: window.location.pathname,
          utmSource: utm.get('utm_source') || null,
          utmCampaign: utm.get('utm_campaign') || null,
          referrer: document.referrer || null,
        },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'chat failed');
      }
      const d = data as any;
      if (d.conversationId && d.conversationId !== conversationId) {
        persistConversationId(d.conversationId);
      }
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: d.reply || '(no response)',
          suggestedActions: d.suggestedActions || [],
          escalated: d.escalated || false,
          ts: Date.now(),
        },
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: "Let me get a human on this — text Nico at (941) 527-9169 and he'll book you same-day.",
          suggestedActions: [{ label: 'Text Nico now', url: 'sms:+19415279169' }],
          ts: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleHookClick = (opt: (typeof HOOK_OPTIONS)[number]) => {
    setHookPicked(true);
    setMessages([{ role: 'user', content: opt.label, ts: Date.now() }]);
    sendToBackend(opt.intentMessage, opt.leadPath);
  };

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || sending) return;
    setMessages(prev => [...prev, { role: 'user', content: text, ts: Date.now() }]);
    setInputValue('');
    sendToBackend(text);
  };

  const handleActionClick = (url: string) => {
    const u = (url || '').trim();
    if (u.startsWith('sms:') || u.startsWith('tel:') || u.startsWith('mailto:')) {
      window.location.href = u;
    } else if (/^https?:\/\//i.test(u)) {
      window.open(u, '_blank', 'noopener,noreferrer');
    } else if (u.startsWith('/')) {
      // Same-site relative path only — never navigate to arbitrary schemes
      // (blocks a model-emitted javascript:/data: action from executing).
      window.location.href = u;
    }
    // anything else (javascript:, data:, bare text) is ignored
  };

  return (
    <>
      {/* Proactive greeting speech-bubble — invites first-time visitors to chat */}
      {!open && showGreeting && (
        <div className="fixed bottom-24 right-5 z-[9998] w-[260px] max-w-[80vw] bg-white rounded-2xl rounded-br-md shadow-2xl border border-gray-200 p-3.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <button
            onClick={dismissGreeting}
            aria-label="Dismiss"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-gray-900 text-white flex items-center justify-center shadow hover:bg-gray-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button onClick={toggleOpen} className="text-left w-full">
            <p className="text-sm font-semibold text-gray-900 leading-snug">👋 Need labs drawn at home?</p>
            <p className="text-xs text-gray-600 mt-1 leading-snug">
              Ask me anything — booking, pricing, or how it works. Same-day visits available.
            </p>
            <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-conve-red">
              <MessageCircle className="h-3.5 w-3.5" /> Chat with Nico
            </span>
          </button>
        </div>
      )}

      {/* Floating bubble */}
      {!open && (
        <button
          onClick={toggleOpen}
          aria-label="Open chat with Ask Nico"
          className="fixed bottom-5 right-5 z-[9998] h-14 w-14 rounded-full bg-conve-red hover:bg-conve-red-dark text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
        >
          <MessageCircle className="h-6 w-6" />
          {hasUnread && (
            <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
          )}
          <span className="absolute right-16 bottom-1 whitespace-nowrap bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none">
            Ask Nico
          </span>
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-[9999] w-full sm:w-[380px] max-w-full h-[100dvh] sm:h-[600px] sm:max-h-[85vh] bg-white sm:rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-conve-red to-red-900 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight">Ask Nico</p>
              <p className="text-[11px] text-rose-100 leading-tight">Licensed phlebs at your door · Same-day available</p>
            </div>
            <button
              onClick={toggleOpen}
              aria-label="Close chat"
              className="h-8 w-8 rounded-full hover:bg-white/15 flex items-center justify-center"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-gradient-to-b from-gray-50 to-white space-y-3">
            {!hookPicked && messages.length === 0 && (
              <>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%] shadow-sm">
                  <p className="text-sm text-gray-900 leading-relaxed font-semibold">
                    Blood draws at your kitchen table — not a waiting room.
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed mt-1.5">
                    Your insurance still covers the tests. We're the phlebotomist who skips the drive. Same-day often available.
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-gray-600">
                    <span className="flex items-center gap-0.5">
                      <span className="text-yellow-500">⭐</span>
                      <span className="font-semibold text-gray-900">5.0</span>
                      <span>· 164 reviews</span>
                    </span>
                    <span className="text-gray-300">·</span>
                    <span>🏈 NFL-trusted</span>
                    <span className="text-gray-300">·</span>
                    <span>🛡️ HIPAA</span>
                  </div>
                  <p className="text-sm text-gray-900 leading-relaxed mt-3 font-medium">
                    Which one fits you?
                  </p>
                </div>
                <div className="space-y-2 max-w-[90%]">
                  {HOOK_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.label}
                        onClick={() => handleHookClick(opt)}
                        className="w-full bg-white border border-gray-200 hover:border-conve-red/40 hover:bg-rose-50 text-left px-4 py-3 rounded-xl flex items-center gap-3 transition shadow-sm"
                      >
                        <Icon className="h-4 w-4 text-conve-red flex-shrink-0" />
                        <span className="text-sm text-gray-900 font-medium">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {messages.map((m, idx) => (
              <ChatMessageBubble
                key={idx}
                message={m}
                onActionClick={handleActionClick}
              />
            ))}

            {sending && (
              <div className="flex items-center gap-1 px-4 py-2 bg-white border border-gray-200 rounded-2xl rounded-tl-sm w-fit">
                <TypingDot delay={0} />
                <TypingDot delay={150} />
                <TypingDot delay={300} />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Contact capture — "leave your info so Nico can follow up" */}
          {hookPicked && !contactDone && (
            <div className="border-t border-gray-100 bg-rose-50/40 px-3 py-2 flex-shrink-0">
              {!showContact ? (
                <button
                  onClick={() => setShowContact(true)}
                  className="w-full text-left text-[12px] text-conve-red font-medium flex items-center gap-1.5"
                >
                  <Phone className="h-3.5 w-3.5" /> Want Nico to follow up personally? Leave your info →
                </button>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-gray-600">Nico will text or email you back personally.</p>
                  <input value={cName} onChange={e => setCName(e.target.value)} placeholder="Your name"
                    className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-conve-red/40" />
                  <div className="flex gap-1.5">
                    <input value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="Mobile" inputMode="tel"
                      className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-conve-red/40" />
                    <input value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="Email" inputMode="email"
                      className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-conve-red/40" />
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={submitContact} disabled={!cName.trim() && !cPhone.trim() && !cEmail.trim()}
                      className="flex-1 bg-conve-red hover:bg-conve-red-dark disabled:opacity-40 text-white text-[12px] font-semibold rounded-lg py-1.5">
                      Send to Nico
                    </button>
                    <button onClick={() => setShowContact(false)} className="text-[12px] text-gray-500 px-2">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Composer — only show after hook picked */}
          {hookPicked && (
            <div className="border-t border-gray-200 bg-white px-3 py-3 flex items-center gap-2 flex-shrink-0">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Type your message…"
                disabled={sending}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-conve-red/40 disabled:opacity-60"
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || sending}
                aria-label="Send message"
                className="h-9 w-9 rounded-xl bg-conve-red hover:bg-conve-red-dark text-white flex items-center justify-center disabled:opacity-40 transition flex-shrink-0"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          )}

          {/* Footer trust strip */}
          <div className="bg-gray-50 border-t border-gray-100 px-4 py-2 text-[10px] text-gray-500 text-center flex-shrink-0">
            Need urgent help? Text <a href="sms:+19415279169" className="text-conve-red font-semibold">(941) 527-9169</a> · Nico reads every message
          </div>
        </div>
      )}
    </>
  );
};

// ─── Sub-components ──────────────────────────────────────────────

const ChatMessageBubble: React.FC<{
  message: ChatMessage;
  onActionClick: (url: string) => void;
}> = ({ message, onActionClick }) => {
  const isUser = message.role === 'user';
  const isHuman = message.role === 'human';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[90%]">
        {isHuman && (
          <div className="text-[10px] font-semibold text-conve-red mb-0.5 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Nico · live
          </div>
        )}
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-conve-red text-white rounded-tr-sm'
              : isHuman
                ? 'bg-rose-50 text-gray-900 border border-conve-red/30 rounded-tl-sm shadow-sm'
                : 'bg-white text-gray-900 border border-gray-200 rounded-tl-sm shadow-sm'
          }`}
        >
          {message.content}
        </div>

        {/* Escalation confirmation */}
        {message.escalated && !isUser && (
          <div className="mt-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-center gap-1.5">
            <Phone className="h-3 w-3 flex-shrink-0" />
            Nico has been notified and will follow up directly.
          </div>
        )}

        {/* Suggested action buttons */}
        {message.suggestedActions && message.suggestedActions.length > 0 && !isUser && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.suggestedActions.map((a, i) => (
              <button
                key={i}
                onClick={() => onActionClick(a.url)}
                className="inline-flex items-center gap-1 bg-white border border-conve-red/30 text-conve-red hover:bg-conve-red hover:text-white text-[12px] font-medium px-3 py-1.5 rounded-full transition"
              >
                {a.label}
                {(a.url.startsWith('http') || a.url.startsWith('/')) && <ExternalLink className="h-3 w-3" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const TypingDot: React.FC<{ delay: number }> = ({ delay }) => (
  <span
    className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
    style={{ animationDelay: `${delay}ms` }}
  />
);

export default ChatbotWidget;
