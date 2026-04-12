import React, { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClaudeAIChat } from '@/components/ai/ClaudeAIChat';

const STEP_LABELS = ['Service Selection', 'Date & Time', 'Patient Info', 'Lab Order', 'Location', 'Review', 'Checkout'];

const BOOKING_SYSTEM_PROMPT = `You are a ConveLabs booking assistant helping patients book mobile phlebotomy appointments. Be concise and friendly.

Services & Pricing:
- Mobile Blood Draw (at home): $150
- Doctor Office Blood Draw: $55
- Senior Blood Draw (65+): $100
- Additional Patient (same location): $75
- Same-day surcharge: +$50
- Weekend surcharge: +$75

Hours: Mon-Fri 6AM-1:30PM, Sat 6AM-9:45AM, Sun closed.
Service area: Central Florida (Orlando metro).

Common questions:
- Fasting: 8-12 hours, water is okay
- Results: Usually 24-48 hours via your lab portal
- Lab orders: Upload during booking or provide your doctor's fax
- Insurance: Lab testing is generally covered; our visit fee is out-of-pocket
- Cancellation: Free if more than 24 hours before appointment

Keep answers short (2-3 sentences max). If unsure, suggest calling (941) 527-9169.`;

interface BookingChatAssistantProps {
  currentStep: number;
}

const BookingChatAssistant: React.FC<BookingChatAssistantProps> = ({ currentStep }) => {
  const [isOpen, setIsOpen] = useState(false);

  const stepContext = STEP_LABELS[currentStep] || 'booking';
  const systemPrompt = `${BOOKING_SYSTEM_PROMPT}\n\nThe patient is currently on the "${stepContext}" step of booking.`;

  return (
    <>
      {/* Floating chat button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-conve-red hover:bg-conve-red-dark text-white"
          size="icon"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] shadow-2xl rounded-xl overflow-hidden border bg-background">
          <div className="flex items-center justify-between px-4 py-3 bg-conve-red text-white">
            <span className="font-medium text-sm">Booking Assistant</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ClaudeAIChat
            title=""
            systemPrompt={systemPrompt}
            placeholder="Ask about services, pricing, fasting..."
            maxHeight="350px"
          />
        </div>
      )}
    </>
  );
};

export default BookingChatAssistant;
