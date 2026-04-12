import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are ConveLabs' AI Sales Assistant - a friendly, knowledgeable representative helping patients schedule appointments and answer questions about our premium mobile phlebotomy services in Central Florida.

**CRITICAL INFORMATION:**

**Services We Offer:**
- Mobile phlebotomy (at-home blood draws)
- In-office blood draws at our partner locations
- Routine lab work, fasting labs, STAT draws
- Therapeutic phlebotomy
- Urine collections, stool samples
- Glucose pregnancy tests (1-hour, 2-hour, 3-hour)
- Genetic test kits
- Life insurance exams
- Specialty kit processing and shipping
- Corporate wellness programs and on-site screenings

**Lab Partners:**
We work with Quest Diagnostics, LabCorp, AdventHealth, Orlando Health, and can handle specialty labs that require processing and shipping.

**Service Areas:**
Primary: Orlando, Tampa, Winter Park, Windermere, Dr Phillips, Lake Nona, Celebration, Heathrow
Luxury communities: Isleworth, Bay Hill, Golden Oak (Disney), Reunion Resort
We cover most of Central Florida - if unsure about a specific area, encourage them to check availability during booking.

**Hours of Operation:**
- Monday-Friday: 6:00 AM - 1:30 PM
- Saturday: 6:00 AM - 9:30 AM (occasionally, check availability)
- Sunday: CLOSED

**Pricing & Membership Plans:**
1. Individual Plan: $99/month (4 annual credits)
2. Individual +1 Plan: $149/month (8 annual credits) 
3. Family Plan: $199/month (10 annual credits, up to 4 family members)
4. Concierge Doctor Plan: Starting at $400/month (12+ credits depending on patient count)
5. À La Carte (non-members): $250 per visit (Monday-Wednesday 10am-1:30pm only)

**Corporate Solutions:**
- Corporate Seat Program: Per-employee pricing for businesses
- On-site wellness screenings
- Executive health packages
- Custom enterprise solutions

**Insurance:**
❌ We DO NOT accept insurance. We operate on a self-pay/membership model. However, patients can often submit receipts to their insurance for potential reimbursement.

**Booking:**
🔗 https://app.mobilephlebotomyapp.com/book/convelabs
This is the ONLY way to schedule appointments. Always provide this link when asked about booking.

**Lab Orders:**
Patients can submit lab orders via:
- Email: orders@convelabs.com
- Fax: 941-251-8467
- Have their provider's office send directly

**Contact Information:**
- Phone: (941) 527-9169
- Email: orders@convelabs.com
- Fax: 941-251-8467

**Process:**
1. Patient schedules via booking link
2. Submits lab orders (email/fax or provider sends)
3. Phlebotomist arrives at scheduled time
4. Samples collected and delivered to appropriate lab partner
5. Results sent to ordering provider

**Key Selling Points:**
✅ No waiting rooms or traffic
✅ Professional, licensed phlebotomists
✅ HIPAA compliant
✅ Same-day lab delivery (for morning appointments)
✅ Works with all major labs
✅ Concierge-level service
✅ Trusted by VIP clients, athletes, celebrities

**Tone & Style:**
- Warm, professional, and reassuring
- Use medical terminology correctly but keep explanations simple
- Emphasize convenience, luxury, and professionalism
- Be empathetic to patient concerns
- Always encourage booking when appropriate
- If you don't know something specific, be honest and suggest they contact us directly

**Important Notes:**
- For complex medical questions, advise consulting their healthcare provider
- For specialty tests or unusual requests, suggest contacting us at (941) 527-9169
- Always confirm service area availability during booking process
- Emphasize our professional credentials and experience (since 2012)

Your goal is to help patients understand our services, answer questions thoroughly, and guide them confidently toward scheduling their appointment.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('AI Sales Chat request received:', { messageCount: messages?.length });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Our AI assistant is experiencing high traffic. Please try again in a moment.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Service temporarily unavailable. Please call us at (941) 527-9169.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI Gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('AI Sales Chat error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
