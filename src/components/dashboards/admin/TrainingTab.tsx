import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Search, Book, HelpCircle, Copy, Mail as MailIcon, ChevronRight,
  Loader2, GraduationCap, Building2, Zap, Clock,
} from 'lucide-react';

/**
 * TRAINING TAB — admin-only
 *
 * Three sections:
 *   1. COURSES — the 4 required training modules + any others
 *   2. FAQ SEARCH — full-text search over training_faqs, with Copy + Email-to-partner
 *   3. ASK NICO — escalation form for anything not covered
 *
 * Hormozi principle: search-first, browse-second. Cmd+K for power users.
 * Every FAQ answer is copy-paste-ready (one click to clipboard).
 */

interface Course {
  id: string; slug: string; title: string; summary: string; category: string;
  content_md: string; estimated_minutes: number; required: boolean; sort_order: number;
}

interface Faq {
  id: string; question: string; answer_short: string; answer_long: string;
  category: string; tags: string[]; partner_org_id: string | null;
}

const TrainingTab: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedFaq, setSelectedFaq] = useState<Faq | null>(null);
  const [showAskNico, setShowAskNico] = useState(false);
  const [askQuestion, setAskQuestion] = useState('');
  const [askContext, setAskContext] = useState('');
  const [askSubmitting, setAskSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load courses + all FAQs on mount
  useEffect(() => {
    (async () => {
      try {
        const [cRes, fRes] = await Promise.all([
          supabase.from('training_courses' as any).select('*').eq('published', true).order('sort_order', { ascending: true }),
          supabase.from('training_faqs' as any).select('*').eq('published', true).limit(50),
        ]);
        setCourses((cRes.data as any) || []);
        setFaqs((fRes.data as any) || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      // Reset to all
      supabase.from('training_faqs' as any).select('*').eq('published', true).limit(50).then(r => setFaqs((r.data as any) || []));
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/training-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ query }),
        });
        const j = await resp.json();
        if (resp.ok) setFaqs(j.faqs || []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const handleCopyAnswer = (faq: Faq) => {
    navigator.clipboard.writeText(`Q: ${faq.question}\n\nA: ${faq.answer_long}`);
    toast.success('Copied to clipboard');
  };

  const handleEmailAnswer = (faq: Faq) => {
    const subject = encodeURIComponent(`Re: ${faq.question}`);
    const body = encodeURIComponent(`${faq.answer_long}\n\n— ConveLabs support\ninfo@convelabs.com | (941) 527-9169`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleAskNico = async () => {
    if (askQuestion.trim().length < 5) { toast.error('Question too short'); return; }
    setAskSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/training-ask-nico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ question: askQuestion, context: askContext || null }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || 'Failed');
      toast.success('Sent to Nico — you\'ll get a reply by email');
      setShowAskNico(false);
      setAskQuestion(''); setAskContext('');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send');
    } finally {
      setAskSubmitting(false);
    }
  };

  const categoryColor = (cat: string): string => {
    switch (cat) {
      case 'system': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'subscription': return 'bg-red-50 text-red-700 border-red-200';
      case 'partner': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'billing': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'scheduling': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'compliance': return 'bg-gray-100 text-gray-700 border-gray-300';
      default: return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
      {/* HEADER */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#B91C1C]/10 flex items-center justify-center flex-shrink-0">
          <GraduationCap className="h-6 w-6 text-[#B91C1C]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Training</h1>
          <p className="text-sm text-gray-600">Everything you need to answer a partner or patient call with confidence.</p>
        </div>
      </div>

      {/* SEARCH BAR — first, because Hormozi says search-first */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search FAQs — try &quot;fasting&quot;, &quot;cancel&quot;, &quot;subscription&quot;, &quot;CAO masking&quot;…"
              className="pl-9 h-11"
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">Can't find what you need? <button onClick={() => setShowAskNico(true)} className="text-[#B91C1C] underline font-medium">Ask Nico directly →</button></p>
        </CardContent>
      </Card>

      {/* REQUIRED COURSES */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Book className="h-5 w-5 text-[#B91C1C]" /> Required courses
          <span className="text-xs text-gray-500 font-normal">({courses.filter(c => c.required).length})</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {courses.filter(c => c.required).map(c => (
            <button key={c.id} onClick={() => setSelectedCourse(c)}
              className="text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-[#B91C1C] hover:shadow-sm transition">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                  <Book className="h-5 w-5 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{c.title}</p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.summary}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={`text-[10px] capitalize ${categoryColor(c.category)}`}>{c.category}</Badge>
                    <span className="text-[10px] text-gray-400 flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {c.estimated_minutes} min</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* FAQ LIST */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-[#B91C1C]" /> FAQs
          <span className="text-xs text-gray-500 font-normal">({faqs.length})</span>
        </h2>
        {faqs.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-gray-500">No matching FAQs. <button onClick={() => setShowAskNico(true)} className="text-[#B91C1C] underline">Ask Nico directly →</button></CardContent></Card>
        ) : (
          <div className="space-y-2">
            {faqs.map(f => (
              <div key={f.id} className="bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition">
                <button onClick={() => setSelectedFaq(f)}
                  className="w-full text-left p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{f.question}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">{f.answer_short}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className={`text-[10px] ${categoryColor(f.category)}`}>{f.category}</Badge>
                      {f.tags?.slice(0, 3).map(t => <span key={t} className="text-[10px] text-gray-400">#{t}</span>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); handleCopyAnswer(f); }} title="Copy answer" className="p-1.5 hover:bg-gray-100 rounded">
                      <Copy className="h-3.5 w-3.5 text-gray-500" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleEmailAnswer(f); }} title="Email this answer" className="p-1.5 hover:bg-gray-100 rounded">
                      <MailIcon className="h-3.5 w-3.5 text-gray-500" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* COURSE DETAIL MODAL */}
      <Dialog open={!!selectedCourse} onOpenChange={() => setSelectedCourse(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Book className="h-5 w-5 text-[#B91C1C]" />
              {selectedCourse?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedCourse && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={`text-xs capitalize ${categoryColor(selectedCourse.category)}`}>{selectedCourse.category}</Badge>
                <span className="text-xs text-gray-500">{selectedCourse.estimated_minutes} min</span>
              </div>
              <div className="max-w-none text-gray-800 text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-gray-900 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-gray-900 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-[#B91C1C] [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1 [&_li]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-gray-900 [&_em]:italic [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12.5px] [&_code]:font-mono [&_code]:text-gray-900 [&_pre]:bg-gray-900 [&_pre]:text-gray-100 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:text-[12px] [&_pre_code]:bg-transparent [&_pre_code]:text-gray-100 [&_pre_code]:p-0 [&_blockquote]:border-l-4 [&_blockquote]:border-[#B91C1C] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_blockquote]:my-3 [&_a]:text-[#B91C1C] [&_a]:underline [&_table]:w-full [&_table]:my-3 [&_table]:text-xs [&_th]:bg-gray-50 [&_th]:font-semibold [&_th]:text-left [&_th]:p-2 [&_th]:border [&_th]:border-gray-200 [&_td]:p-2 [&_td]:border [&_td]:border-gray-200 [&_hr]:my-4 [&_hr]:border-gray-200"><ReactMarkdown>{selectedCourse.content_md}</ReactMarkdown></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* FAQ DETAIL MODAL */}
      <Dialog open={!!selectedFaq} onOpenChange={() => setSelectedFaq(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">{selectedFaq?.question}</DialogTitle></DialogHeader>
          {selectedFaq && (
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
                <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">Short answer (for SMS / quick reply)</p>
                <p className="text-emerald-900">{selectedFaq.answer_short}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Full context</p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{selectedFaq.answer_long}</p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => handleCopyAnswer(selectedFaq)} className="flex-1 gap-1"><Copy className="h-3.5 w-3.5" /> Copy</Button>
                <Button size="sm" variant="outline" onClick={() => handleEmailAnswer(selectedFaq)} className="flex-1 gap-1"><MailIcon className="h-3.5 w-3.5" /> Email it</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ASK NICO MODAL */}
      <Dialog open={showAskNico} onOpenChange={setShowAskNico}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-[#B91C1C]" /> Ask Nico</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Nico gets this as an email with your name attached. Reply comes back the same day. Every answer becomes a future public FAQ so nobody has to ask twice.</p>
            <div>
              <label className="text-xs font-medium">Your question *</label>
              <Textarea value={askQuestion} onChange={(e) => setAskQuestion(e.target.value)} rows={3} placeholder="What's the escalation policy for a Stripe dispute?" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium">Context <span className="text-gray-400">(optional)</span></label>
              <Textarea value={askContext} onChange={(e) => setAskContext(e.target.value)} rows={2} placeholder="Dr. Sher called asking about invoice #123. She thinks we double-charged." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAskNico(false)} disabled={askSubmitting}>Cancel</Button>
            <Button onClick={handleAskNico} disabled={askSubmitting || askQuestion.trim().length < 5} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
              {askSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send to Nico'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TrainingTab;
