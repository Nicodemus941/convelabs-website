import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, BookOpen, Copy, Loader2, Clock, ChevronRight, Sparkles, DollarSign, MessageSquare, Package, ArrowLeft, Volume2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

/**
 * Scripts tab — the staff playbook surface.
 *
 * Reads category='script_*' rows from training_courses so admin can also
 * edit them inline via the existing Documentation admin UI. Categories:
 *   - script_sales      (sell memberships, explain tiers)
 *   - script_operations (workflows, delivery, refunds, notify provider)
 *   - script_support    (handle questions, fasting, dashboard walk-through)
 *
 * Hormozi framing: scripts make everyone on the team as effective as the
 * owner. The more polished and searchable the library, the less time the
 * owner spends answering the same questions.
 */

interface Script {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  content_md: string;
  estimated_minutes: number | null;
  sort_order: number | null;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: any; color: string; description: string }> = {
  script_sales:      { label: 'Sales',      icon: DollarSign,    color: '#B91C1C', description: 'Close memberships, explain tiers, handle objections.' },
  script_operations: { label: 'Operations', icon: Package,       color: '#0F766E', description: 'Workflows: specimen delivery, refunds, provider outreach.' },
  script_support:    { label: 'Support',    icon: MessageSquare, color: '#0369A1', description: 'Answer questions: dashboards, fasting, scheduling.' },
};

const ScriptsTab: React.FC = () => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('training_courses')
        .select('id, slug, title, summary, category, content_md, estimated_minutes, sort_order')
        .like('category', 'script_%')
        .eq('published', true)
        .order('sort_order', { ascending: true });
      setScripts((data as any[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scripts.filter(s => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (!q) return true;
      return (s.title || '').toLowerCase().includes(q)
        || (s.summary || '').toLowerCase().includes(q)
        || (s.content_md || '').toLowerCase().includes(q);
    });
  }, [scripts, search, categoryFilter]);

  const grouped = useMemo(() => {
    const g: Record<string, Script[]> = {};
    for (const s of filtered) {
      g[s.category] = g[s.category] || [];
      g[s.category].push(s);
    }
    return g;
  }, [filtered]);

  const selected = scripts.find(s => s.id === selectedId) || null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Detail view
  if (selected) {
    return <ScriptDetailView script={selected} onBack={() => setSelectedId(null)} />;
  }

  // Index view
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-[#B91C1C]" /> Scripts & Playbooks
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Every repeatable conversation, structured. Find a script → say the words → close the loop.
          <span className="text-gray-400"> · {scripts.length} scripts · editable in Documentation tab</span>
        </p>
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search scripts — e.g. 'VIP', 'fasting', 'refund'…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${categoryFilter === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
          >All · {scripts.length}</button>
          {Object.entries(CATEGORY_LABELS).map(([key, meta]) => {
            const count = scripts.filter(s => s.category === key).length;
            const active = categoryFilter === key;
            return (
              <button
                key={key}
                onClick={() => setCategoryFilter(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1 ${active ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                style={active ? { backgroundColor: meta.color } : {}}
              >
                {meta.label} · {count}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category sections */}
      <div className="space-y-5">
        {Object.entries(grouped).map(([category, catScripts]) => {
          const meta = CATEGORY_LABELS[category] || { label: category, icon: BookOpen, color: '#4B5563', description: '' };
          const Icon = meta.icon;
          return (
            <section key={category}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${meta.color}15` }}>
                  <Icon className="h-4 w-4" style={{ color: meta.color }} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">{meta.label}</h2>
                  <p className="text-[11px] text-gray-500">{meta.description}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {catScripts.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className="text-left bg-white border border-gray-200 rounded-lg p-3 hover:border-[#B91C1C] hover:shadow-sm transition group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-[#B91C1C] transition">{s.title}</p>
                        {s.summary && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{s.summary}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          {s.estimated_minutes && (
                            <Badge variant="outline" className="text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" /> {s.estimated_minutes} min read</Badge>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-[#B91C1C] flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-500">
            <Sparkles className="h-6 w-6 mx-auto mb-2 text-gray-300" />
            No scripts match "{search}". Try a shorter search or <button onClick={() => { setSearch(''); setCategoryFilter('all'); }} className="text-[#B91C1C] underline">clear filters</button>.
          </div>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════
// Detail view
// ════════════════════════════════════════════════════════════════════════

const ScriptDetailView: React.FC<{ script: Script; onBack: () => void }> = ({ script, onBack }) => {
  const meta = CATEGORY_LABELS[script.category] || { label: script.category, icon: BookOpen, color: '#4B5563', description: '' };
  const Icon = meta.icon;

  // Extract the first quote (text between > ... and a newline) for quick-copy
  const firstQuote = useMemo(() => {
    const m = /^>\s*\*?"?([^"\n]+)"?\*?$/m.exec(script.content_md);
    return m ? m[1].trim() : null;
  }, [script.content_md]);

  const copyFirstQuote = () => {
    if (!firstQuote) return;
    navigator.clipboard.writeText(firstQuote);
    toast.success('Opening line copied to clipboard');
  };

  const copyAll = () => {
    navigator.clipboard.writeText(script.content_md);
    toast.success('Full script copied');
  };

  const speakFirst = () => {
    if (!firstQuote || !('speechSynthesis' in window)) return;
    const utt = new SpeechSynthesisUtterance(firstQuote);
    utt.rate = 0.95;
    window.speechSynthesis.speak(utt);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-3 gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to all scripts
      </Button>

      <Card className="shadow-sm">
        <CardContent className="p-6 md:p-8">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${meta.color}15` }}>
              <Icon className="h-5 w-5" style={{ color: meta.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <Badge variant="outline" className="text-[10px] mb-1">{meta.label}</Badge>
              <h1 className="text-2xl font-bold text-gray-900">{script.title}</h1>
              {script.summary && <p className="text-sm text-gray-600 mt-1">{script.summary}</p>}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 py-3 border-y border-gray-100 mb-5">
            {firstQuote && (
              <Button size="sm" variant="outline" onClick={copyFirstQuote} className="gap-1.5 text-xs">
                <Copy className="h-3.5 w-3.5" /> Copy opening line
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={copyAll} className="gap-1.5 text-xs">
              <Copy className="h-3.5 w-3.5" /> Copy full script
            </Button>
            {firstQuote && 'speechSynthesis' in window && (
              <Button size="sm" variant="outline" onClick={speakFirst} className="gap-1.5 text-xs">
                <Volume2 className="h-3.5 w-3.5" /> Hear opening
              </Button>
            )}
          </div>

          {/* Full markdown content */}
          <article className="prose prose-sm max-w-none prose-headings:font-bold prose-blockquote:border-l-4 prose-blockquote:border-[#B91C1C] prose-blockquote:bg-red-50/30 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:not-italic prose-blockquote:font-medium prose-blockquote:text-gray-800 prose-table:text-sm prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs">
            <ReactMarkdown>{script.content_md}</ReactMarkdown>
          </article>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScriptsTab;
