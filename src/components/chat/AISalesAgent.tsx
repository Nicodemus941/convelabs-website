import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, ExternalLink, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BOOKING_URL, withSource } from '@/lib/constants/urls';
import { useBookingModalSafe } from '@/contexts/BookingModalContext';


interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const AISalesAgent: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm ConveLabs' AI assistant. I can help you schedule appointments, answer questions about our services, pricing, and more. How can I help you today?"
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bookingModal = useBookingModalSafe();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: textToSend };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(
        `https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/ai-sales-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdXlvbmhyeHh0eXVpeXJkaXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1MDExODgsImV4cCI6MjA2MzA3NzE4OH0.ZKP-k5fizUtKZsekV9RFL1wYcVfIHEeQWArs-4l5Q-Y`,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map(m => ({
              role: m.role,
              content: m.content
            }))
          }),
        }
      );

      if (!response.ok || !response.body) {
        throw new Error('Failed to get response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      let textBuffer = '';

      // Add placeholder for assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantMessage += content;
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: 'assistant',
                  content: assistantMessage
                };
                return newMessages;
              });
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I apologize, but I'm having trouble connecting right now. Please call us at (941) 527-9169 or visit our booking link below."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions = [
    { label: 'Schedule Appointment', action: () => handleSendMessage('How do I schedule an appointment?') },
    { label: 'View Pricing', action: () => handleSendMessage('What are your pricing plans?') },
    { label: 'Service Areas', action: () => handleSendMessage('What areas do you serve?') },
    { label: 'Hours & Contact', action: () => handleSendMessage('What are your hours and how can I contact you?') },
  ];

  return (
    <>
      {/* Chat Bubble Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50",
          "bg-conve-red hover:bg-conve-red/90 text-white",
          "transition-all duration-300 ease-in-out",
          isOpen && "scale-0"
        )}
        aria-label="Open chat"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-8rem)]",
          "bg-background border border-border rounded-2xl shadow-2xl z-50",
          "transition-all duration-300 ease-in-out transform",
          isOpen ? "scale-100 opacity-100" : "scale-0 opacity-0 pointer-events-none",
          "flex flex-col"
        )}
      >
        {/* Header */}
        <div className="bg-conve-red text-white p-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">ConveLabs Assistant</h3>
              <p className="text-xs text-white/80">Typically replies instantly</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            className="text-white hover:bg-white/20 h-8 w-8"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20">
          {messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "flex",
                message.role === 'user' ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                  message.role === 'user'
                    ? "bg-conve-red text-white rounded-br-sm"
                    : "bg-background border border-border rounded-bl-sm"
                )}
              >
                {message.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-background border border-border rounded-2xl rounded-bl-sm px-4 py-2.5">
                <div className="flex gap-1">
                  <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Actions */}
        {messages.length <= 2 && (
          <div className="px-4 pb-3 pt-2 border-t border-border bg-background">
            <p className="text-xs text-muted-foreground mb-2">Quick actions:</p>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={action.action}
                  className="text-xs h-auto py-2 justify-start"
                  disabled={isLoading}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="px-4 pb-2 pt-1 border-t border-border bg-background flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => {
              if (bookingModal) {
                bookingModal.openModal('ai_chat');
                return;
              }
              window.location.href = withSource(BOOKING_URL, 'ai_chat');
            }}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Book Now
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = 'tel:9415279169'}
            className="h-8 w-8 p-0"
          >
            <Phone className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = 'mailto:orders@convelabs.com'}
            className="h-8 w-8 p-0"
          >
            <Mail className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-background rounded-b-2xl">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask me anything..."
              className="flex-1 px-4 py-2.5 rounded-full border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-conve-red/20"
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="rounded-full bg-conve-red hover:bg-conve-red/90 h-10 w-10"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};
