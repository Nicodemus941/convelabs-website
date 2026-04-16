import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import {
  Bot, Send, Loader2, Sparkles, Trash2, AlertTriangle,
  Calendar, Users, MessageSquare, FileText, Activity, Heart,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  loading?: boolean;
}

const SUGGESTED_PROMPTS = [
  { icon: Heart, label: "System health check", prompt: "Run a system health check" },
  { icon: Calendar, label: "Today's schedule", prompt: "Show me today's full schedule" },
  { icon: Calendar, label: "Tomorrow's readiness", prompt: "Is everything ready for tomorrow's appointments?" },
  { icon: AlertTriangle, label: "Failed notifications", prompt: "Show me any failed SMS messages in the last 24 hours" },
  { icon: FileText, label: "Unpaid invoices", prompt: "Show me all unpaid or overdue invoices" },
  { icon: Users, label: "Unassigned appointments", prompt: "Are there any appointments without a phlebotomist assigned?" },
];

const AIOpsAssistant: React.FC = () => {
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

  // Focus input on mount
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
      // Build conversation history for context
      const history = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error: fnError } = await supabase.functions.invoke('ai-ops-assistant', {
        body: { messages: history },
      });

      if (fnError) throw fnError;

      if (!data?.success) {
        throw new Error(data?.error || 'Unknown error from AI assistant');
      }

      setMessages(prev =>
        prev.map(m =>
          m.loading
            ? { ...m, content: data.response, loading: false }
            : m
        )
      );
    } catch (err: any) {
      console.error('AI Ops Assistant error:', err);
      const errMessage = err.message?.includes('ANTHROPIC_API_KEY')
        ? 'The AI assistant requires an Anthropic API key. Please add ANTHROPIC_API_KEY to your Supabase Edge Function secrets.'
        : `Sorry, I encountered an error: ${err.message || 'Unknown error'}. Please try again.`;

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

  // Render markdown-like content (bold, code blocks, lists)
  const renderContent = (text: string) => {
    // Split by code blocks first
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

      // Process inline formatting
      const lines = part.split('\n');
      return lines.map((line, j) => {
        // Headers
        if (line.startsWith('### ')) {
          return <h4 key={`${i}-${j}`} className="font-bold text-sm mt-3 mb-1">{line.slice(4)}</h4>;
        }
        if (line.startsWith('## ')) {
          return <h3 key={`${i}-${j}`} className="font-bold text-base mt-3 mb-1">{line.slice(3)}</h3>;
        }

        // Bullet points
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={`${i}-${j}`} className="flex gap-2 ml-2 my-0.5">
              <span className="text-conve-red mt-1">•</span>
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(2)) }} />
            </div>
          );
        }

        // Numbered lists
        const numMatch = line.match(/^(\d+)\.\s/);
        if (numMatch) {
          return (
            <div key={`${i}-${j}`} className="flex gap-2 ml-2 my-0.5">
              <span className="text-conve-red font-semibold min-w-[1.2em]">{numMatch[1]}.</span>
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(numMatch[0].length)) }} />
            </div>
          );
        }

        // Table rows (pipe-separated)
        if (line.includes('|') && line.trim().startsWith('|')) {
          const cells = line.split('|').filter(c => c.trim());
          // Skip separator rows
          if (cells.every(c => /^[-:\s]+$/.test(c))) return null;
          const isHeader = j > 0 && lines[j + 1]?.includes('---');
          return (
            <div key={`${i}-${j}`} className={`grid gap-2 text-xs py-1 px-2 ${isHeader ? 'font-semibold bg-gray-50 rounded' : 'border-b border-gray-100'}`}
              style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
              {cells.map((cell, k) => (
                <span key={k} className="truncate" dangerouslySetInnerHTML={{ __html: inlineFormat(cell.trim()) }} />
              ))}
            </div>
          );
        }

        // Empty lines
        if (!line.trim()) return <br key={`${i}-${j}`} />;

        // Regular text
        return (
          <p key={`${i}-${j}`} className="my-0.5" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
        );
      });
    });
  };

  // Inline formatting: **bold**, `code`, ✅/❌ emoji badges
  const inlineFormat = (text: string): string => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-conve-red">$1</code>')
      .replace(/✅/g, '<span class="inline-flex items-center justify-center w-4 h-4 bg-green-100 rounded-full text-green-600 text-xs">✓</span>')
      .replace(/❌/g, '<span class="inline-flex items-center justify-center w-4 h-4 bg-red-100 rounded-full text-red-600 text-xs">✗</span>')
      .replace(/⚠️/g, '<span class="inline-flex items-center justify-center w-4 h-4 bg-amber-100 rounded-full text-amber-600 text-xs">!</span>');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">AI Operations Assistant</h1>
            <p className="text-sm text-muted-foreground">
              Ask me anything about appointments, patients, invoices, or system health
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
            /* Empty state with suggested prompts */
            <div className="h-full flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-violet-600" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">How can I help?</h2>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
                I can check system health, look up appointments, resend notifications, manage invoices, and troubleshoot issues.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                {SUGGESTED_PROMPTS.map((sp, i) => {
                  const Icon = sp.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => sendMessage(sp.prompt)}
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-gray-200 hover:border-violet-300 hover:bg-violet-50/50 text-left text-sm transition-all group"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground group-hover:text-violet-600 flex-shrink-0" />
                      <span className="text-muted-foreground group-hover:text-foreground">{sp.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Message history */
            messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="h-3.5 w-3.5 text-white" />
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
                      <span className="text-xs">Thinking...</span>
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
              placeholder="Ask about appointments, patients, invoices..."
              className="flex-1 h-11 rounded-xl border-gray-200 focus:border-violet-400 focus:ring-violet-400"
              disabled={isLoading}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="h-11 px-4 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            AI assistant powered by Claude. Responses may need verification for critical actions.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default AIOpsAssistant;
