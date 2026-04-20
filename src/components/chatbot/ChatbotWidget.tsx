import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, X, Send, Loader2, Sparkles, Heart, Building2, Link as LinkIcon, Phone, ExternalLink } from 'lucide-react';

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
  role: 'user' | 'assistant';
  content: string;
  suggestedActions?: Array<{ label: string; url: string }>;
  escalated?: boolean;
  ts: number;
}

const LS_VISITOR_KEY = 'convelabs_chat_visitor_id';
const LS_CONVO_KEY = 'convelabs_chat_conversation_id';
const LS_SEEN_WELCOME_KEY = 'convelabs_chat_seen_welcome';

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
const HOOK_OPTIONS: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; intentMessage: string; leadPath: 'patient' | 'provider' | 'lab_request' }> = [
  {
    icon: Heart,
    label: 'I need labs drawn at home',
    intentMessage: 'I need labs drawn at home',
    leadPath: 'patient',
  },
  {
    icon: Building2,
    label: "I'm a provider/practice",
    intentMessage: "I'm a provider looking into partnering with ConveLabs",
    leadPath: 'provider',
  },
  {
    icon: LinkIcon,
    label: 'I got a link from my doctor',
    intentMessage: 'My doctor sent me a link to book through ConveLabs',
    leadPath: 'lab_request',
  },
];

const ChatbotWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [hookPicked, setHookPicked] = useState<boolean>(false);
  const [hasUnread, setHasUnread] = useState(false);
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

  // Show the "unread" dot after 15s on landing page if user hasn't opened it (first visit only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(LS_SEEN_WELCOME_KEY);
    if (seen) return;
    const t = setTimeout(() => setHasUnread(true), 15000);
    return () => clearTimeout(t);
  }, []);

  const toggleOpen = () => {
    setOpen(o => !o);
    setHasUnread(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_SEEN_WELCOME_KEY, '1');
    }
  };

  const persistConversationId = (id: string) => {
    setConversationId(id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_CONVO_KEY, id);
    }
  };

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
          content: "I'm having trouble right now — please text (941) 527-9169 and Nico will respond personally.",
          suggestedActions: [{ label: 'Text Nico', url: 'sms:+19415279169' }],
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
    if (url.startsWith('sms:') || url.startsWith('tel:') || url.startsWith('mailto:')) {
      window.location.href = url;
    } else if (url.startsWith('http')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
  };

  return (
    <>
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
              <p className="text-[11px] text-rose-100 leading-tight">Concierge mobile phlebotomy · Central FL</p>
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
                  <p className="text-sm text-gray-900 leading-relaxed">
                    Hey — I'm the ConveLabs assistant. I'll help you book a blood draw, answer questions, or connect you with Nico directly.
                  </p>
                  <p className="text-sm text-gray-900 leading-relaxed mt-2">
                    Which one are you?
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
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[90%]">
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-conve-red text-white rounded-tr-sm'
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
