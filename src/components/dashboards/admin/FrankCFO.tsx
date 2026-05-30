import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import {
  Send, Loader2, Trash2, Briefcase, DollarSign,
  CalendarDays, CalendarRange, CalendarClock, PieChart, TrendingUp, Users,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  loading?: boolean;
}

const SUGGESTED_PROMPTS = [
  { icon: CalendarDays, label: "Daily report", prompt: "Give me today's revenue report" },
  { icon: CalendarRange, label: "Weekly report", prompt: "Give me this week's report vs last week" },
  { icon: CalendarClock, label: "Monthly report", prompt: "Give me the full monthly report with an allocation plan" },
  { icon: TrendingUp, label: "Year-to-date", prompt: "Give me the year-to-date report with margin and revenue mix" },
  { icon: PieChart, label: "How do I allocate?", prompt: "How should I allocate this month's revenue across owner pay, profit, tax, marketing and OpEx?" },
  { icon: Users, label: "Concentration risk", prompt: "Show me our customer revenue concentration and flag any risk" },
];

const FrankCFO: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    const loadingMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error: fnError } = await supabase.functions.invoke('frank-cfo', {
        body: { messages: history },
      });

      if (fnError) throw fnError;

      if (!data?.success) {
        throw new Error(data?.error || 'Unknown error from Frank');
      }

      setMessages(prev =>
        prev.map(m =>
          m.loading
            ? { ...m, content: data.response, loading: false }
            : m
        )
      );
    } catch (err: any) {
      console.error('Frank CFO error:', err);
      const errMessage = err.message?.includes('ANTHROPIC_API_KEY')
        ? 'Frank requires an Anthropic API key. Please add ANTHROPIC_API_KEY to your Supabase Edge Function secrets.'
        : `Sorry, I hit an error pulling the numbers: ${err.message || 'Unknown error'}. Please try again.`;

      setMessages(prev =>
        prev.map(m =>
          m.loading
            ? { ...m, content: errMessage, loading: false }
            : m
        )
      );
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  };

  // Render markdown-like content (bold, code blocks, lists, tables)
  const renderContent = (text: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g);

    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const code = part.replace(/```\w*\n?/, '').replace(/```$/, '');
        return (
          <pre key={i} className="bg-gray-900 text-gray-100 rounded-lg p-3 my-2 text-xs overflow-x-auto">
            <code>{code}</code>
          </pre>
        );
      }

      const lines = part.split('\n');
      return lines.map((line, j) => {
        if (line.startsWith('### ')) {
          return <h4 key={`${i}-${j}`} className="font-bold text-sm mt-3 mb-1">{line.slice(4)}</h4>;
        }
        if (line.startsWith('## ')) {
          return <h3 key={`${i}-${j}`} className="font-bold text-base mt-3 mb-1">{line.slice(3)}</h3>;
        }

        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={`${i}-${j}`} className="flex gap-2 ml-2 my-0.5">
              <span className="text-emerald-600 mt-1">•</span>
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(2)) }} />
            </div>
          );
        }

        const numMatch = line.match(/^(\d+)\.\s/);
        if (numMatch) {
          return (
            <div key={`${i}-${j}`} className="flex gap-2 ml-2 my-0.5">
              <span className="text-emerald-600 font-semibold min-w-[1.2em]">{numMatch[1]}.</span>
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(numMatch[0].length)) }} />
            </div>
          );
        }

        if (line.includes('|') && line.trim().startsWith('|')) {
          const cells = line.split('|').filter(c => c.trim());
          if (cells.every(c => /^[-:\s]+$/.test(c))) return null;
          const isHeader = j > 0 && lines[j + 1]?.includes('---');
          return (
            <div key={`${i}-${j}`} className={`grid gap-2 text-xs py-1 px-2 ${isHeader ? 'font-semibold bg-emerald-50 rounded' : 'border-b border-gray-100'}`}
              style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
              {cells.map((cell, k) => (
                <span key={k} className="truncate" dangerouslySetInnerHTML={{ __html: inlineFormat(cell.trim()) }} />
              ))}
            </div>
          );
        }

        if (!line.trim()) return <br key={`${i}-${j}`} />;

        return (
          <p key={`${i}-${j}`} className="my-0.5" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
        );
      });
    });
  };

  const inlineFormat = (text: string): string => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-emerald-700">$1</code>')
      .replace(/✅/g, '<span class="inline-flex items-center justify-center w-4 h-4 bg-green-100 rounded-full text-green-600 text-xs">✓</span>')
      .replace(/❌/g, '<span class="inline-flex items-center justify-center w-4 h-4 bg-red-100 rounded-full text-red-600 text-xs">✗</span>')
      .replace(/⚠️/g, '<span class="inline-flex items-center justify-center w-4 h-4 bg-amber-100 rounded-full text-amber-600 text-xs">!</span>');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center shadow-lg">
            <Briefcase className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Frank — Chief Financial Officer</h1>
            <p className="text-sm text-muted-foreground">
              Your CFO. Revenue tracking, allocation guidance, and daily/weekly/monthly/YTD reports.
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearChat} className="text-muted-foreground">
            <Trash2 className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-green-100 flex items-center justify-center mb-4">
                <DollarSign className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Where's the money, Nicodemme?</h2>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
                I track every dollar that lands and tell you exactly how to allocate it — owner pay, profit, tax, marketing, and growth. Ask me for a report or how to split this month's cash.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                {SUGGESTED_PROMPTS.map((sp, i) => {
                  const Icon = sp.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => sendMessage(sp.prompt)}
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-left text-sm transition-all group"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground group-hover:text-emerald-600 flex-shrink-0" />
                      <span className="text-muted-foreground group-hover:text-foreground">{sp.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Briefcase className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-conve-red text-white rounded-br-md'
                      : 'bg-gray-50 text-foreground rounded-bl-md border border-gray-100'
                  }`}
                >
                  {msg.loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground py-1">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs">Frank is pulling the numbers...</span>
                    </div>
                  ) : msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none">{renderContent(msg.content)}</div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t p-3 bg-white">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask Frank for a report or how to allocate revenue..."
              className="flex-1 h-11 rounded-xl border-gray-200 focus:border-emerald-400 focus:ring-emerald-400"
              disabled={isLoading}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="h-11 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-green-700 hover:from-emerald-600 hover:to-green-800 text-white"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Frank pulls live figures from your Stripe ledger. Verify before any major financial move.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default FrankCFO;
