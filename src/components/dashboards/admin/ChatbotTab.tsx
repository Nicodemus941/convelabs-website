import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  MessageCircle, AlertTriangle, CheckCircle2, User, Bot, RefreshCw,
  Search, ExternalLink, Sparkles, TrendingUp, DollarSign, Users, ChevronRight, Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/**
 * ChatbotTab — Admin view for the Ask-Nico landing page bot.
 *
 * 3 sub-tabs:
 *   1. Conversations — live list of chats, click to drill into messages
 *   2. Frequent Questions — top user questions by frequency, one-click
 *      send to social_topic_queue for content-factory seeding
 *   3. Analytics — funnel metrics, cost, top sources
 */

interface Conversation {
  id: string;
  visitor_id: string | null;
  lead_path: string | null;
  captured_email: string | null;
  captured_phone: string | null;
  captured_zip: string | null;
  has_lab_order: boolean | null;
  timing: string | null;
  started_at: string;
  qualified_at: string | null;
  escalated_at: string | null;
  booked_at: string | null;
  escalation_reason: string | null;
  status: string;
  message_count: number;
  utm_source: string | null;
  landing_url: string | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  escalation_triggered: boolean;
  guardrail_triggered: string | null;
  created_at: string;
}

interface FrequentQuestion {
  question_preview: string;
  occurrences: number;
  last_asked: string;
  sample_convo_id: string;
}

interface Stats {
  window_days: number;
  total_conversations: number;
  today_conversations: number;
  qualified: number;
  captured_contact: number;
  booked: number;
  escalated: number;
  stumped: number;
  total_messages: number;
  avg_messages_per_conv: number;
  estimated_cost_usd: number;
  lead_paths: Array<{ path: string; n: number }> | null;
  top_sources: Array<{ source: string; n: number }> | null;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-blue-50 text-blue-700 border-blue-200',
  closed: 'bg-gray-50 text-gray-600 border-gray-200',
  escalated: 'bg-red-50 text-red-700 border-red-200',
  rate_limited: 'bg-amber-50 text-amber-700 border-amber-200',
};

const LEAD_PATH_STYLES: Record<string, string> = {
  patient: 'bg-rose-50 text-rose-700 border-rose-200',
  provider: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  lab_request: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unknown: 'bg-gray-50 text-gray-600 border-gray-200',
};

const ChatbotTab: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [frequentQs, setFrequentQs] = useState<FrequentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'escalated' | 'qualified' | 'today'>('all');
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    const [convRes, statsRes, qsRes] = await Promise.all([
      supabase
        .from('chatbot_conversations' as any)
        .select('*')
        .order('started_at', { ascending: false })
        .limit(100),
      supabase.rpc('get_chatbot_stats' as any, { p_days: 30 }),
      supabase.rpc('get_chatbot_frequent_questions' as any, { p_days: 30, p_limit: 15 }),
    ]);
    setConversations((convRes.data as Conversation[]) || []);
    setStats((statsRes.data as any) || null);
    setFrequentQs((qsRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const loadMessages = async (convo: Conversation) => {
    setSelectedConvo(convo);
    setLoadingMessages(true);
    const { data } = await supabase
      .from('chatbot_messages' as any)
      .select('*')
      .eq('conversation_id', convo.id)
      .order('created_at', { ascending: true });
    setSelectedMessages((data as Message[]) || []);
    setLoadingMessages(false);
  };

  const queueAsContentTopic = async (question: string) => {
    const { error } = await supabase.from('social_topic_queue' as any).insert({
      topic: `Answer: ${question.substring(0, 140)}`,
      category: 'patient_ed',
      priority: 3,
      target_platforms: ['linkedin', 'instagram'],
      notes: `Auto-seeded from chatbot frequent question. Write content that definitively answers this so future visitors get the answer from both the bot AND organic content.`,
      suggested_by: 'chatbot_stumped',
    });
    if (error) {
      toast.error(`Failed to queue: ${error.message}`);
    } else {
      toast.success('Queued for content factory');
    }
  };

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (filter === 'escalated' && c.status !== 'escalated') return false;
      if (filter === 'qualified' && !c.qualified_at) return false;
      if (filter === 'today' && new Date(c.started_at).toDateString() !== new Date().toDateString()) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          (c.captured_email || '').toLowerCase().includes(s) ||
          (c.captured_zip || '').includes(s) ||
          (c.lead_path || '').toLowerCase().includes(s) ||
          (c.escalation_reason || '').toLowerCase().includes(s) ||
          (c.visitor_id || '').toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [conversations, filter, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-conve-red" /> Ask Nico Chatbot
          </h1>
          <p className="text-sm text-muted-foreground">Landing-page conversations, analytics, and content feedback loop</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Stat strip */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatTile label="Today" value={stats.today_conversations} icon={MessageCircle} />
          <StatTile label="30-day total" value={stats.total_conversations} icon={TrendingUp} />
          <StatTile label="Qualified" value={stats.qualified} icon={CheckCircle2} color="emerald" />
          <StatTile label="Escalated" value={stats.escalated} icon={AlertTriangle} color="red" />
          <StatTile label="Avg msgs/convo" value={stats.avg_messages_per_conv} icon={Users} />
          <StatTile label="30-day cost" value={`$${stats.estimated_cost_usd.toFixed(2)}`} icon={DollarSign} />
        </div>
      )}

      <Tabs defaultValue="conversations">
        <TabsList>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="frequent-questions">Frequent Questions {frequentQs.length > 0 && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">{frequentQs.length}</span>}</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* ── CONVERSATIONS TAB ──────────────────────────────── */}
        <TabsContent value="conversations" className="space-y-3 mt-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email / zip / reason…" className="pl-9" />
            </div>
            <div className="flex gap-1">
              {(['all', 'today', 'qualified', 'escalated'] as const).map((f) => (
                <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)} className="capitalize">
                  {f}
                </Button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              No conversations match. {conversations.length === 0 && 'Waiting for real visitors to hit the widget.'}
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((c) => (
                <Card key={c.id} className="cursor-pointer hover:shadow-md transition" onClick={() => loadMessages(c)}>
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-conve-red/10 flex items-center justify-center flex-shrink-0">
                      <MessageCircle className="h-5 w-5 text-conve-red" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="outline" className={STATUS_STYLES[c.status] || STATUS_STYLES.active}>
                          {c.status}
                        </Badge>
                        {c.lead_path && (
                          <Badge variant="outline" className={LEAD_PATH_STYLES[c.lead_path] || LEAD_PATH_STYLES.unknown}>
                            {c.lead_path}
                          </Badge>
                        )}
                        {c.booked_at && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Booked</Badge>}
                        {c.qualified_at && !c.booked_at && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Qualified</Badge>}
                        <span className="text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(c.started_at), { addSuffix: true })} · {c.message_count} msgs
                        </span>
                      </div>
                      <div className="text-sm flex flex-wrap gap-x-4 gap-y-0.5 text-gray-700">
                        {c.captured_email && <span>📧 {c.captured_email}</span>}
                        {c.captured_phone && <span>📱 {c.captured_phone}</span>}
                        {c.captured_zip && <span>📍 {c.captured_zip}</span>}
                        {c.utm_source && <span className="text-[11px] text-muted-foreground">utm: {c.utm_source}</span>}
                      </div>
                      {c.escalation_reason && (
                        <p className="text-xs text-red-700 mt-1 flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" /> {c.escalation_reason}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── FREQUENT QUESTIONS TAB ──────────────────────────── */}
        <TabsContent value="frequent-questions" className="space-y-3 mt-4">
          <Card className="bg-gradient-to-br from-amber-50 to-rose-50 border-amber-200">
            <CardContent className="p-4 flex gap-3">
              <Sparkles className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-900">Content factory feedback loop</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  These are questions visitors ask the bot. Click "Queue as content topic" on any of them to auto-seed a social post — the bot's weak spot becomes Monday's LinkedIn post.
                </p>
              </div>
            </CardContent>
          </Card>

          {frequentQs.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              No frequent questions yet. Come back once the bot has handled a few dozen chats.
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {frequentQs.map((q, i) => (
                <Card key={i}>
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-conve-red/10 flex items-center justify-center text-xs font-bold text-conve-red flex-shrink-0">
                      {q.occurrences}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 leading-snug">{q.question_preview}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Last asked {formatDistanceToNow(new Date(q.last_asked), { addSuffix: true })}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => queueAsContentTopic(q.question_preview)}>
                      Queue as content topic
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── ANALYTICS TAB ──────────────────────────────────── */}
        <TabsContent value="analytics" className="space-y-4 mt-4">
          {!stats ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Funnel */}
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">30-day Funnel</p>
                  <FunnelBar label="Chats started" value={stats.total_conversations} max={stats.total_conversations} />
                  <FunnelBar label="Qualified (zip + intent)" value={stats.qualified} max={stats.total_conversations} />
                  <FunnelBar label="Contact captured" value={stats.captured_contact} max={stats.total_conversations} />
                  <FunnelBar label="Booked (click to /book-now)" value={stats.booked} max={stats.total_conversations} />
                  <FunnelBar label="Escalated to Nico" value={stats.escalated} max={stats.total_conversations} color="red" />
                </CardContent>
              </Card>

              {/* Lead paths */}
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Lead Paths</p>
                  {(stats.lead_paths || []).map((p) => (
                    <FunnelBar key={p.path} label={p.path} value={p.n} max={stats.total_conversations} />
                  ))}
                </CardContent>
              </Card>

              {/* Top sources */}
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Top UTM Sources</p>
                  {(stats.top_sources || []).map((s) => (
                    <FunnelBar key={s.source} label={s.source} value={s.n} max={stats.total_conversations} />
                  ))}
                </CardContent>
              </Card>

              {/* Token + cost */}
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Token Usage + Cost (30d)</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Total messages</span><strong>{stats.total_messages.toLocaleString()}</strong></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Input tokens</span><strong>{(stats as any).total_input_tokens?.toLocaleString()}</strong></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Output tokens</span><strong>{(stats as any).total_output_tokens?.toLocaleString()}</strong></div>
                    <div className="flex justify-between border-t pt-2 mt-2"><span className="font-semibold">Estimated cost</span><strong className="text-emerald-700">${stats.estimated_cost_usd.toFixed(2)}</strong></div>
                    <p className="text-[10px] text-muted-foreground italic mt-1">$3/M input + $15/M output (claude-sonnet-4-5)</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Conversation detail dialog */}
      <Dialog open={!!selectedConvo} onOpenChange={(v) => !v && setSelectedConvo(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-conve-red" />
              Conversation · {selectedConvo?.lead_path || 'unknown path'}
            </DialogTitle>
          </DialogHeader>

          {selectedConvo && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-[11px]">
                <Badge variant="outline" className={STATUS_STYLES[selectedConvo.status] || ''}>{selectedConvo.status}</Badge>
                {selectedConvo.captured_email && <span>📧 {selectedConvo.captured_email}</span>}
                {selectedConvo.captured_zip && <span>📍 {selectedConvo.captured_zip}</span>}
                {selectedConvo.utm_source && <span>utm: {selectedConvo.utm_source}</span>}
                {selectedConvo.landing_url && <span>from: {selectedConvo.landing_url}</span>}
                <span className="text-muted-foreground">
                  Started {formatDistanceToNow(new Date(selectedConvo.started_at), { addSuffix: true })}
                </span>
              </div>
              {selectedConvo.escalation_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Escalated to Nico</p>
                    <p className="mt-0.5">{selectedConvo.escalation_reason}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 space-y-2 mt-3 min-h-[200px]">
            {loadingMessages ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : selectedMessages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No messages yet.</p>
            ) : (
              selectedMessages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[85%]">
                    <div className={`flex items-center gap-1 text-[10px] mb-0.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'} text-muted-foreground`}>
                      {m.role === 'user' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                      <span className="capitalize">{m.role}</span>
                      <span>· {new Date(m.created_at).toLocaleTimeString()}</span>
                      {m.guardrail_triggered && <span className="text-amber-700 font-semibold ml-1">· guardrail: {m.guardrail_triggered}</span>}
                    </div>
                    <div className={`px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-conve-red text-white rounded-tr-sm'
                        : 'bg-white border border-gray-200 rounded-tl-sm'
                    }`}>
                      {m.content}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Small sub-components ──────────────────────────────────────

const StatTile: React.FC<{ label: string; value: number | string; icon: React.ComponentType<{ className?: string }>; color?: 'red' | 'emerald' }> = ({ label, value, icon: Icon, color }) => {
  const accent = color === 'red' ? 'text-red-600' : color === 'emerald' ? 'text-emerald-600' : 'text-gray-900';
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </div>
        <div className={`text-xl font-bold mt-1 ${accent}`}>{value}</div>
      </CardContent>
    </Card>
  );
};

const FunnelBar: React.FC<{ label: string; value: number; max: number; color?: 'red' }> = ({ label, value, max, color }) => {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const barColor = color === 'red' ? 'bg-red-500' : 'bg-conve-red';
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-700 capitalize">{label}</span>
        <span className="font-semibold">{value} <span className="text-muted-foreground">({pct}%)</span></span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export default ChatbotTab;
