import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, X, Send, Loader2, Sparkles, Heart, Building2, Link as LinkIcon, Phone, ExternalLink, Crown, CalendarCheck, RotateCcw, Clock } from 'lucide-react';
import { trackEvent } from '@/lib/posthog';
import { Turnstile } from '@/components/security/Turnstile';

// Cloudflare Turnstile — bot gate on the paid Sonnet endpoint. Inert (widget
// never renders, token never required) until the site key is configured.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

/**
 * ChatbotWidget — "Ask Nico" landing-page assistant.
 *
 * Floats in the bottom-right as a red bubble. Click → opens chat window
 * with a 4-button welcome (Hormozi Layer 1 hook). User picks one, the
 * widget routes that choice to the chatbot edge function as the first
 * real message, and the conversation proceeds naturally.
 *
 * State persisted in localStorage:
 *   convelabs_chat_visitor_id      → stable across sessions (one UUID forever)
 *   convelabs_chat_conversation_id → per-conversation ("Start over" clears it)
 *
 * Why not Supabase auth? Visitors are anonymous. visitor_id lets us
 * correlate multiple sessions from the same person without PII.
 *
 * 2026-10-02 UX pass:
 *   • Reopening (or reloading) with a saved conversation now restores the
 *     whole transcript from the server. Before, the id persisted but the
 *     messages did not, so a returning visitor saw the welcome buttons while
 *     the server treated every message as turn N of an old chat — and if
 *     Nico had taken over, his replies had nowhere to render.
 *   • Human-handoff state is shown ("Nico is on this chat") and the composer
 *     adapts; the bot's "you'll hear back" acknowledgement no longer looks
 *     like a bot answer.
 *   • Hours + expectation line ("replies 8 AM–9 PM ET, usually in minutes").
 *   • Lead form validates phone/email, has labels, and says what happens next.
 *   • Persistent "Book now" shortcut once the visitor is in the conversation.
 *   • Accessibility: dialog semantics, Escape closes, focus moves into the
 *     window on open, live region for new messages, labelled controls.
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

const OWNER_SMS = 'sms:+19415279169';
const OWNER_PHONE_DISPLAY = '(941) 527-9169';

function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = window.localStorage.getItem(LS_VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(LS_VISITOR_KEY, id);
  }
  return id;
}

/** Staff hours in ET: 8 AM – 9 PM, every day (matches the quiet-hours rule). */
function staffOnlineNow(): boolean {
  try {
    const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(new Date()));
    return h >= 8 && h < 21;
  } catch { return true; }
}

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const isValidPhone = (v: string) => { const d = v.replace(/\D/g, ''); return d.length === 10 || (d.length === 11 && d.startsWith('1')); };

// Welcome hook — Hormozi Layer 1
// Order = revenue priority: VIP first (highest LTV), then patient (most volume),
// then doctor-link (already-converted), then provider (B2B).
const HOOK_OPTIONS: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; intentMessage: string; leadPath: 'patient' | 'provider' | 'lab_request' | 'vip' }> = [
  { icon: Crown, label: 'Tell me about VIP membership', intentMessage: 'Tell me about VIP membership and the Founding 50', leadPath: 'vip' },
  { icon: Heart, label: 'I need labs drawn at home', intentMessage: 'I need labs drawn at home', leadPath: 'patient' },
  { icon: LinkIcon, label: 'I got a link from my doctor', intentMessage: 'My doctor sent me a link to book through ConveLabs', leadPath: 'lab_request' },
  { icon: Building2, label: "I'm a provider/practice", intentMessage: "I'm a provider looking into partnering with ConveLabs", leadPath: 'provider' },
];

const ChatbotWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [hookPicked, setHookPicked] = useState<boolean>(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [handoff, setHandoff] = useState<'ai' | 'human'>('ai');
  const [hydrating, setHydrating] = useState(false);
  // Proactive greeting bubble — a friendly speech bubble that pops next to the
  // launcher on first visit to invite engagement (vs. waiting for a click).
  const [showGreeting, setShowGreeting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const visitorId = useMemo(() => getOrCreateVisitorId(), []);
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(LS_CONVO_KEY);
  });
  const online = useMemo(() => staffOnlineNow(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Turnstile token (single-use per request) ──
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const captchaTokenRef = useRef<string | null>(null);
  const captchaFailedRef = useRef<boolean>(false);
  const onCaptchaToken = (t: string | null) => { captchaTokenRef.current = t; };
  const onCaptchaError = () => { captchaFailedRef.current = true; };
  const waitForToken = (ms = 4000): Promise<void> => {
    if (!TURNSTILE_SITE_KEY) return Promise.resolve();
    if (captchaTokenRef.current || captchaFailedRef.current) return Promise.resolve();
    return new Promise((resolve) => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (captchaTokenRef.current || captchaFailedRef.current || Date.now() - start > ms) { clearInterval(iv); resolve(); }
      }, 150);
    });
  };
  const resetCaptcha = () => {
    if (!TURNSTILE_SITE_KEY) return;
    captchaTokenRef.current = null;
    setCaptchaNonce(n => n + 1);
  };

  // Smart auto-scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sending]);

  // Proactive engagement on first visit (only if they've never opened it).
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

  // Escape closes; focus moves into the window on open and back to the launcher on close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => { (composerRef.current || windowRef.current)?.focus(); }, 50);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); launcherRef.current?.focus(); };
  }, [open, hookPicked]);

  const dismissGreeting = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowGreeting(false);
    if (typeof window !== 'undefined') window.localStorage.setItem(LS_SEEN_WELCOME_KEY, '1');
  };

  const toggleOpen = () => {
    const willOpen = !open;
    setOpen(willOpen);
    setHasUnread(false);
    setShowGreeting(false);
    if (typeof window !== 'undefined') window.localStorage.setItem(LS_SEEN_WELCOME_KEY, '1');
    if (willOpen) {
      trackEvent('chatbot_opened', {
        path: typeof window !== 'undefined' ? window.location.pathname : null,
        visitor_id: visitorId, conversation_id: conversationId, had_greeting: showGreeting,
      });
    }
  };

  const persistConversationId = (id: string) => {
    setConversationId(id);
    if (typeof window !== 'undefined') window.localStorage.setItem(LS_CONVO_KEY, id);
  };

  /** "Start over" — forget the saved thread and show the welcome again. */
  const startOver = () => {
    setConversationId(null);
    if (typeof window !== 'undefined') window.localStorage.removeItem(LS_CONVO_KEY);
    setMessages([]);
    setHookPicked(false);
    setHandoff('ai');
    setContactDone(false);
    setShowContact(false);
    seenIds.current.clear();
    trackEvent('chatbot_start_over', { visitor_id: visitorId });
  };

  // ── Contact capture ("leave your info so Nico can follow up") ──
  const [showContact, setShowContact] = useState(false);
  const [contactDone, setContactDone] = useState(false);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cError, setCError] = useState<string | null>(null);

  const submitContact = async () => {
    const phone = cPhone.trim(), email = cEmail.trim();
    if (!phone && !email) { setCError('Add a mobile number or an email so Nico can reach you.'); return; }
    if (phone && !isValidPhone(phone)) { setCError('That mobile number doesn\'t look right — 10 digits, please.'); return; }
    if (email && !isValidEmail(email)) { setCError('That email doesn\'t look right.'); return; }
    setCError(null);
    setContactDone(true);
    setShowContact(false);
    const first = cName.trim().split(' ')[0];
    setMessages(prev => [...prev, {
      role: 'human',
      content: `Thanks${first ? `, ${first}` : ''}! Nico will follow up personally — you'll hear back here${phone ? ', by text' : ''}${email ? ' and by email' : ''}${online ? ', usually within the hour.' : '. He replies 8 AM–9 PM ET, so expect to hear from him in the morning.'}`,
      ts: Date.now(),
    }]);
    trackEvent('chatbot_contact_submitted', { visitor_id: visitorId, conversation_id: conversationId, has_phone: !!phone, has_email: !!email });
    try {
      await waitForToken();
      await supabase.functions.invoke('chatbot', {
        body: {
          visitorId, conversationId,
          message: '[contact submitted]',
          contact: { name: cName.trim() || null, phone: phone || null, email: email || null },
          landingUrl: window.location.pathname,
          captchaToken: captchaTokenRef.current,
        },
      });
      resetCaptcha();
    } catch { /* non-blocking — owner still gets pinged on next poll/escalation */ }
  };

  // ── Hydrate + poll ──────────────────────────────────────────────
  // First fetch for a saved conversation restores the whole transcript (all
  // roles) and the handoff state; later polls append only what is new.
  const seenIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!open || !conversationId || !SB_KEY) return;
    let active = true;
    const poll = async (initial: boolean) => {
      try {
        if (initial && messages.length === 0) setHydrating(true);
        const r = await fetch(`${SB_URL}/functions/v1/chatbot?conversationId=${encodeURIComponent(conversationId)}&visitorId=${encodeURIComponent(visitorId)}`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        });
        const j = await r.json();
        if (!active || !Array.isArray(j?.messages)) return;
        if (j.handoffState === 'human') setHandoff('human'); else if (j.handoffState) setHandoff('ai');

        const restoring = initial && messages.length === 0;
        const fresh = j.messages.filter((m: any) =>
          !seenIds.current.has(m.id) &&
          (restoring ? (m.role === 'user' || m.role === 'assistant' || m.role === 'human') : m.role === 'human') &&
          m.content !== '[contact submitted]');
        if (fresh.length) {
          fresh.forEach((m: any) => seenIds.current.add(m.id));
          setMessages(prev => [...prev, ...fresh.map((m: any) => ({
            role: m.role as ChatMessage['role'],
            content: m.content,
            suggestedActions: restoring && Array.isArray(m.suggested_actions) ? m.suggested_actions : undefined,
            ts: Date.parse(m.created_at) || Date.now(),
            dbId: m.id,
          }))]);
          if (restoring) setHookPicked(true);
        } else if (restoring) {
          // Mark every existing id as seen so later polls only append new ones.
          j.messages.forEach((m: any) => seenIds.current.add(m.id));
        }
      } catch { /* transient */ }
      finally { if (initial) setHydrating(false); }
    };
    poll(true);
    const t = setInterval(() => poll(false), 5000);
    return () => { active = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationId, visitorId]);

  const sendToBackend = async (message: string, leadPath?: 'patient' | 'provider' | 'lab_request' | 'vip') => {
    setSending(true);
    try {
      await waitForToken();
      const utm = new URLSearchParams(window.location.search);
      const { data, error } = await supabase.functions.invoke('chatbot', {
        body: {
          visitorId, conversationId, message,
          leadPath: leadPath || null,
          landingUrl: window.location.pathname,
          utmSource: utm.get('utm_source') || null,
          utmCampaign: utm.get('utm_campaign') || null,
          referrer: document.referrer || null,
          captchaToken: captchaTokenRef.current,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || 'chat failed');
      const d = data as any;
      if (d.conversationId && d.conversationId !== conversationId) persistConversationId(d.conversationId);
      if (d.humanHandoff) setHandoff('human');
      setMessages(prev => [...prev, {
        role: d.humanHandoff ? 'human' : 'assistant',
        content: d.reply || '(no response)',
        suggestedActions: d.suggestedActions || [],
        escalated: !!d.escalated && !d.humanHandoff,
        ts: Date.now(),
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Let me get a human on this — text Nico at ${OWNER_PHONE_DISPLAY} and he'll book you same-day.`,
        suggestedActions: [{ label: 'Text Nico now', url: OWNER_SMS }],
        ts: Date.now(),
      }]);
    } finally {
      setSending(false);
      resetCaptcha();
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
      // Same-site relative path only — never navigate to arbitrary schemes.
      window.location.href = u;
    }
  };

  // Book-now shortcut carries the conversation id so the booking is attributed.
  const bookUrl = conversationId ? `/book-now?cid=${conversationId}` : '/book-now';

  return (
    <>
      {/* Proactive greeting speech-bubble — invites first-time visitors to chat */}
      {!open && showGreeting && (
        <div className="fixed bottom-24 right-5 z-[9998] w-[260px] max-w-[80vw] bg-white rounded-2xl rounded-br-md shadow-2xl border border-gray-200 p-3.5 animate-in fade-in slide-in-from-bottom-2 duration-300" role="status">
          <button onClick={dismissGreeting} aria-label="Dismiss greeting"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-gray-900 text-white flex items-center justify-center shadow hover:bg-gray-700">
            <X className="h-3.5 w-3.5" />
          </button>
          <button onClick={toggleOpen} className="text-left w-full">
            <p className="text-sm font-semibold text-gray-900 leading-snug">Need labs drawn at home?</p>
            <p className="text-xs text-gray-600 mt-1 leading-snug">Ask me anything — booking, pricing, or how it works. Same-day visits available.</p>
            <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-conve-red"><MessageCircle className="h-3.5 w-3.5" /> Chat with Nico</span>
          </button>
        </div>
      )}

      {/* Floating bubble */}
      {!open && (
        <button
          ref={launcherRef}
          onClick={toggleOpen}
          aria-label={hasUnread ? 'Open chat with Ask Nico — new message' : 'Open chat with Ask Nico'}
          aria-haspopup="dialog"
          className="fixed bottom-5 right-5 z-[9998] h-14 w-14 rounded-full bg-conve-red hover:bg-conve-red-dark text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center group focus:outline-none focus-visible:ring-4 focus-visible:ring-conve-red/40"
        >
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
          {hasUnread && <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" aria-hidden="true" />}
          <span className="absolute right-16 bottom-1 whitespace-nowrap bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none" aria-hidden="true">Ask Nico</span>
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div
          ref={windowRef}
          role="dialog"
          aria-modal="false"
          aria-label="Ask Nico chat"
          tabIndex={-1}
          className="fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-[9999] w-full sm:w-[380px] max-w-full h-[100dvh] sm:h-[600px] sm:max-h-[85vh] bg-white sm:rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden focus:outline-none"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-conve-red to-red-900 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center" aria-hidden="true"><Sparkles className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight">Ask Nico</p>
              <p className="text-[11px] text-rose-100 leading-tight flex items-center gap-1">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-300' : 'bg-rose-200'}`} aria-hidden="true" />
                {online ? 'Nico replies 8 AM–9 PM ET · usually in minutes' : 'Away until 8 AM ET · the assistant answers now'}
              </p>
            </div>
            {hookPicked && (
              <button onClick={startOver} aria-label="Start a new conversation" title="Start over"
                className="h-8 w-8 rounded-full hover:bg-white/15 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <button onClick={toggleOpen} aria-label="Close chat"
              className="h-8 w-8 rounded-full hover:bg-white/15 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Handoff banner */}
          {handoff === 'human' && (
            <div className="bg-rose-50 border-b border-conve-red/20 px-4 py-2 text-[12px] text-gray-800 flex items-start gap-2 flex-shrink-0" role="status">
              <Sparkles className="h-3.5 w-3.5 text-conve-red flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span><strong>Nico is on this chat.</strong> Replies come here{contactDone ? ' and by text/email' : ''}. {online ? 'Usually within the hour.' : 'He replies 8 AM–9 PM ET.'}</span>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-gradient-to-b from-gray-50 to-white space-y-3" aria-live="polite" aria-relevant="additions">
            {hydrating && messages.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-500 px-1"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Picking up where you left off…</div>
            )}
            {!hookPicked && messages.length === 0 && !hydrating && (
              <>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%] shadow-sm">
                  <p className="text-sm text-gray-900 leading-relaxed font-semibold">Blood draws at your kitchen table — not a waiting room.</p>
                  <p className="text-sm text-gray-700 leading-relaxed mt-1.5">Your insurance still covers the tests. We're the phlebotomist who skips the drive. Same-day often available.</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-gray-600">
                    <span className="flex items-center gap-0.5"><span className="text-yellow-500" aria-hidden="true">★</span><span className="font-semibold text-gray-900">5.0</span><span>· 164 reviews</span></span>
                    <span className="text-gray-300" aria-hidden="true">·</span>
                    <span>NFL-trusted</span>
                    <span className="text-gray-300" aria-hidden="true">·</span>
                    <span>HIPAA</span>
                  </div>
                  <p className="text-sm text-gray-900 leading-relaxed mt-3 font-medium">Which one fits you?</p>
                </div>
                <div className="space-y-2 max-w-[90%]" role="group" aria-label="What brings you here">
                  {HOOK_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button key={opt.label} onClick={() => handleHookClick(opt)}
                        className="w-full bg-white border border-gray-200 hover:border-conve-red/40 hover:bg-rose-50 text-left px-4 py-3 rounded-xl flex items-center gap-3 transition shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-conve-red/40">
                        <Icon className="h-4 w-4 text-conve-red flex-shrink-0" aria-hidden="true" />
                        <span className="text-sm text-gray-900 font-medium">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-500 px-1">Or <a href={bookUrl} className="text-conve-red font-semibold underline">book now</a> if you already know what you need.</p>
              </>
            )}

            {messages.map((m, idx) => (
              <ChatMessageBubble key={m.dbId || idx} message={m} onActionClick={handleActionClick} />
            ))}

            {sending && (
              <div className="flex items-center gap-1 px-4 py-2 bg-white border border-gray-200 rounded-2xl rounded-tl-sm w-fit" aria-label="Assistant is typing">
                <TypingDot delay={0} /><TypingDot delay={150} /><TypingDot delay={300} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Contact capture — "leave your info so Nico can follow up" */}
          {hookPicked && !contactDone && (
            <div className="border-t border-gray-100 bg-rose-50/40 px-3 py-2 flex-shrink-0">
              {!showContact ? (
                <button onClick={() => setShowContact(true)} className="w-full text-left text-[12px] text-conve-red font-medium flex items-center gap-1.5 min-h-[32px]">
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Want Nico to follow up personally? Leave your info →
                </button>
              ) : (
                <form className="space-y-1.5" onSubmit={e => { e.preventDefault(); submitContact(); }} aria-label="Leave your contact info">
                  <p className="text-[11px] text-gray-600">Nico will text or email you back personally{online ? ' — usually within the hour.' : ' between 8 AM and 9 PM ET.'}</p>
                  <label htmlFor="askn-name" className="sr-only">Your name</label>
                  <input id="askn-name" value={cName} onChange={e => setCName(e.target.value)} placeholder="Your name" autoComplete="name"
                    className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-conve-red/40" />
                  <div className="flex gap-1.5">
                    <label htmlFor="askn-phone" className="sr-only">Mobile number</label>
                    <input id="askn-phone" value={cPhone} onChange={e => { setCPhone(e.target.value); setCError(null); }} placeholder="Mobile" inputMode="tel" autoComplete="tel"
                      className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-conve-red/40" />
                    <label htmlFor="askn-email" className="sr-only">Email</label>
                    <input id="askn-email" value={cEmail} onChange={e => { setCEmail(e.target.value); setCError(null); }} placeholder="Email" inputMode="email" autoComplete="email"
                      className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-conve-red/40" />
                  </div>
                  {cError && <p className="text-[11px] text-red-700" role="alert">{cError}</p>}
                  <div className="flex gap-1.5">
                    <button type="submit" disabled={!cPhone.trim() && !cEmail.trim()}
                      className="flex-1 bg-conve-red hover:bg-conve-red-dark disabled:opacity-40 text-white text-[12px] font-semibold rounded-lg py-2 min-h-[36px]">
                      Send to Nico
                    </button>
                    <button type="button" onClick={() => { setShowContact(false); setCError(null); }} className="text-[12px] text-gray-500 px-2 min-h-[36px]">Cancel</button>
                  </div>
                  <p className="text-[10px] text-gray-400">No spam. We never text 9 PM–8 AM ET.</p>
                </form>
              )}
            </div>
          )}

          {/* Composer — only show after hook picked */}
          {hookPicked && (
            <div className="border-t border-gray-200 bg-white px-3 py-2.5 flex-shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <label htmlFor="askn-composer" className="sr-only">Type your message</label>
                <input
                  id="askn-composer"
                  ref={composerRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={handoff === 'human' ? 'Message Nico…' : 'Type your message…'}
                  disabled={sending}
                  enterKeyHint="send"
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-conve-red/40 disabled:opacity-60"
                />
                <button onClick={handleSend} disabled={!inputValue.trim() || sending} aria-label="Send message"
                  className="h-10 w-10 rounded-xl bg-conve-red hover:bg-conve-red-dark text-white flex items-center justify-center disabled:opacity-40 transition flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-conve-red/40">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <a href={bookUrl} className="inline-flex items-center gap-1 whitespace-nowrap bg-white border border-conve-red/30 text-conve-red hover:bg-conve-red hover:text-white text-[11px] font-medium px-2.5 py-1 rounded-full transition">
                  <CalendarCheck className="h-3 w-3" aria-hidden="true" /> Book now
                </a>
                <a href={OWNER_SMS} className="inline-flex items-center gap-1 whitespace-nowrap bg-white border border-gray-200 text-gray-700 hover:border-gray-400 text-[11px] font-medium px-2.5 py-1 rounded-full transition">
                  <Phone className="h-3 w-3" aria-hidden="true" /> Text Nico
                </a>
                {!online && <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] text-gray-500 px-1"><Clock className="h-3 w-3" aria-hidden="true" /> Human replies resume 8 AM ET</span>}
              </div>
            </div>
          )}

          {/* Turnstile bot gate — mounts on open so a token is ready before the first send. */}
          {TURNSTILE_SITE_KEY && (
            <div className="bg-gray-50 border-t border-gray-100 px-4 pt-2 flex justify-center flex-shrink-0">
              <Turnstile key={captchaNonce} siteKey={TURNSTILE_SITE_KEY} onToken={onCaptchaToken} onError={onCaptchaError} />
            </div>
          )}

          {/* Footer trust strip */}
          <div className="bg-gray-50 border-t border-gray-100 px-4 py-2 text-[10px] text-gray-500 text-center flex-shrink-0">
            Need urgent help? Text <a href={OWNER_SMS} className="text-conve-red font-semibold">{OWNER_PHONE_DISPLAY}</a> · Nico reads every message · HIPAA-conscious: please don't share lab results here
          </div>
        </div>
      )}
    </>
  );
};

// ─── Sub-components ──────────────────────────────────────────────

const ChatMessageBubble: React.FC<{ message: ChatMessage; onActionClick: (url: string) => void }> = ({ message, onActionClick }) => {
  const isUser = message.role === 'user';
  const isHuman = message.role === 'human';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[90%]">
        {isHuman && (
          <div className="text-[10px] font-semibold text-conve-red mb-0.5 flex items-center gap-1"><Sparkles className="h-3 w-3" aria-hidden="true" /> Nico · live</div>
        )}
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser ? 'bg-conve-red text-white rounded-tr-sm'
          : isHuman ? 'bg-rose-50 text-gray-900 border border-conve-red/30 rounded-tl-sm shadow-sm'
          : 'bg-white text-gray-900 border border-gray-200 rounded-tl-sm shadow-sm'}`}>
          <span className="sr-only">{isUser ? 'You: ' : isHuman ? 'Nico: ' : 'Assistant: '}</span>
          {message.content}
        </div>

        {message.escalated && !isUser && (
          <div className="mt-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-center gap-1.5" role="status">
            <Phone className="h-3 w-3 flex-shrink-0" aria-hidden="true" /> Nico has been notified and will follow up directly.
          </div>
        )}

        {message.suggestedActions && message.suggestedActions.length > 0 && !isUser && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.suggestedActions.map((a, i) => (
              <button key={i} onClick={() => onActionClick(a.url)}
                className="inline-flex items-center gap-1 bg-white border border-conve-red/30 text-conve-red hover:bg-conve-red hover:text-white text-[12px] font-medium px-3 py-1.5 min-h-[32px] rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-conve-red/40">
                {a.label}
                {(a.url.startsWith('http') || a.url.startsWith('/')) && <ExternalLink className="h-3 w-3" aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const TypingDot: React.FC<{ delay: number }> = ({ delay }) => (
  <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
);

export default ChatbotWidget;
