
import React from "react";
import { Check, ArrowRight, Percent, Star, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { useBookingModalSafe } from "@/contexts/BookingModalContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const PAY_PER_VISIT = [
  { service: "Office Visit (Standard)", price: "$55" },
  { service: "Mobile Blood Draw (At Home)", price: "$150" },
  { service: "Senior Blood Draw (65+)", price: "$100" },
  { service: "Specialty Collection Kit", price: "$185" },
  { service: "Genova Diagnostics Kit", price: "$200" },
  { service: "Therapeutic Phlebotomy", price: "$200" },
  { service: "Additional Patient (same location)", price: "$75" },
  { service: "STAT / Same-Day Surcharge", price: "+$100" },
  { service: "Extended Area Surcharge", price: "+$75" },
];

const MEMBERSHIP_TIERS = [
  {
    name: "Member",
    annual: 99,
    badge: null,
    color: "border-blue-200",
    badgeColor: "",
    mobilePrice: "$130",
    officePrice: "$49",
    seniorPrice: "$85",
    addlPatient: "$55",
    features: [
      "Mobile visits: $130 (save $20)",
      "Office visits: $49 (save $6)",
      "Senior visits: $85 (save $15)",
      "Weekend appointments (Sat 6 AM - 9:30 AM)",
      "Online patient portal access",
    ],
  },
  {
    name: "VIP",
    annual: 199,
    badge: "Most Popular",
    color: "border-conve-red",
    badgeColor: "bg-conve-red",
    mobilePrice: "$115",
    officePrice: "$45",
    seniorPrice: "$75",
    addlPatient: "$45",
    features: [
      "Mobile visits: $115 (save $35)",
      "Office visits: $45 (save $10)",
      "Senior visits: $75 (save $25)",
      "Weekend appointments (Sat 6 AM - 9:30 AM)",
      "Priority same-day scheduling",
      "Family add-ons at $45 each",
      "Extended hours availability",
    ],
  },
  {
    name: "Concierge",
    annual: 399,
    badge: "Best Value",
    color: "border-amber-400",
    badgeColor: "bg-amber-500",
    mobilePrice: "$99",
    officePrice: "$39",
    seniorPrice: "$65",
    addlPatient: "$35",
    features: [
      "Mobile visits: $99 (save $51)",
      "Office visits: $39 (save $16)",
      "Senior visits: $65 (save $35)",
      "Weekend & extended hours",
      "Dedicated phlebotomist",
      "Same-day guaranteed",
      "NDA available for VIP clients",
      "Family add-ons at $35 each",
      "Concierge phone support",
    ],
  },
];

const FAQS = [
  { q: "What does the membership fee cover?", a: "The membership is a low annual fee ($99-$399) that unlocks discounted per-visit pricing on every service, plus access to weekend appointments which are member-exclusive. You pay per visit at the discounted rate — no credits or prepayment required." },
  { q: "Can non-members still book appointments?", a: "Absolutely. Non-members can book any service at standard rates (office from $55, mobile from $150). However, weekend appointments are member-exclusive." },
  { q: "How quickly does the membership pay for itself?", a: "The $99 Member tier pays for itself in just 5 mobile visits ($20 saved per visit). VIP pays for itself in 6 visits. Most patients recoup their fee within the first few appointments." },
  { q: "How does the family add-on work?", a: "VIP and Concierge members can add family members for $45 or $35 per additional patient at the same location — significantly less than booking separate visits." },
  { q: "Can I cancel my membership?", a: "Yes. Memberships are billed annually. If you cancel, you keep your benefits until the end of your billing period." },
  { q: "What makes Concierge worth $399/year?", a: "Concierge members pay just $99 per mobile visit (vs $150 standard), get a dedicated phlebotomist, guaranteed same-day availability, NDA options, and concierge phone support. If you book 8+ visits per year, it saves over $400." },
];

const Pricing = () => {
  const bookingModal = useBookingModalSafe();
  const [subscribing, setSubscribing] = React.useState<string | null>(null);

  const PLAN_PRICES: Record<string, number> = { 'Member': 99, 'VIP': 199, 'Concierge': 399 };

  const handleSubscribe = async (planName: string) => {
    setSubscribing(planName);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/signup'; return; }

      const price = PLAN_PRICES[planName] || 99;
      const origin = window.location.origin;

      // Create Stripe checkout directly via the Stripe API edge function
      const { data, error } = await supabase.functions.invoke('create-appointment-checkout', {
        body: {
          serviceType: 'membership',
          serviceName: `ConveLabs ${planName} Membership (Annual)`,
          amount: price * 100, // cents
          tipAmount: 0,
          appointmentDate: new Date().toISOString().split('T')[0],
          appointmentTime: '',
          patientDetails: {
            firstName: user.user_metadata?.firstName || user.user_metadata?.first_name || '',
            lastName: user.user_metadata?.lastName || user.user_metadata?.last_name || '',
            email: user.email || '',
          },
          locationDetails: { address: '', city: '', state: 'FL', zipCode: '' },
          serviceDetails: { additionalNotes: `Membership: ${planName} Annual $${price}` },
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Subscribe error:', err);
      toast.error(err.message || 'Failed to start checkout. Please try again.');
    } finally {
      setSubscribing(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Hero */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-gray-50 to-background">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-4 py-2 mb-6">
            <Percent className="h-4 w-4 text-green-600" />
            <span className="text-sm font-semibold text-green-800">Members save up to 25% on every visit</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-lg text-muted-foreground">
            No hidden fees. No credits to track. Pay per visit, or join a membership for discounts and weekend access.
          </p>
        </div>
      </section>

      {/* Pay-Per-Visit */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-2">Pay-Per-Visit Pricing</h2>
          <p className="text-muted-foreground text-center mb-8">No commitment required. Book anytime Monday - Friday.</p>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {PAY_PER_VISIT.map((item) => (
                  <div key={item.service} className="flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors">
                    <span className="font-medium">{item.service}</span>
                    <span className="font-bold text-lg">{item.price}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="text-center mt-6">
            <Button onClick={() => bookingModal?.openModal('pricing_ppv')} size="lg" className="bg-conve-red hover:bg-conve-red-dark text-white rounded-xl px-8">
              <Calendar className="mr-2 h-5 w-5" /> Book Now — No Membership Required
            </Button>
          </div>
        </div>
      </section>

      {/* Membership */}
      <section id="membership" className="py-12 md:py-16 bg-gray-50">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Membership Plans</h2>
            <p className="text-muted-foreground">Annual membership for discounts on every visit + exclusive weekend appointments.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {MEMBERSHIP_TIERS.map((tier) => (
              <Card key={tier.name} className={`relative border-2 ${tier.color} overflow-hidden`}>
                {tier.badge && (
                  <div className={`absolute top-0 left-0 right-0 ${tier.badgeColor} text-white text-center text-xs font-bold py-1.5`}>{tier.badge}</div>
                )}
                <CardContent className={`p-6 ${tier.badge ? 'pt-10' : ''}`}>
                  <h3 className="text-xl font-bold">{tier.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-bold">${tier.annual}</span>
                    <span className="text-muted-foreground">/year</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">That's ${Math.round(tier.annual / 12)}/month billed annually</p>
                  <div className="mt-3 inline-flex items-center gap-1 bg-green-100 text-green-800 text-sm font-bold px-3 py-1 rounded-full">
                    <Percent className="h-3.5 w-3.5" /> Mobile from {tier.mobilePrice}
                  </div>
                  <div className="mt-5 space-y-3">
                    {tier.features.map((f) => (
                      <div key={f} className="flex items-start gap-2.5">
                        <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{f}</span>
                      </div>
                    ))}
                  </div>
                  <Button className={`w-full mt-6 rounded-xl ${tier.badge ? 'bg-conve-red hover:bg-conve-red-dark text-white' : ''}`} variant={tier.badge ? 'default' : 'outline'}
                    disabled={subscribing === tier.name}
                    onClick={() => handleSubscribe(tier.name)}>
                    {subscribing === tier.name ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : <>Get {tier.name} <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Card className="inline-block">
              <CardContent className="py-4 px-6">
                <p className="text-sm font-medium mb-2">Mobile blood draw pricing comparison:</p>
                <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
                  <span className="text-muted-foreground">Non-member: <span className="line-through">$150</span></span>
                  <span className="text-blue-600 font-bold">Member: $130</span>
                  <span className="text-conve-red font-bold">VIP: $115</span>
                  <span className="text-amber-600 font-bold">Concierge: $99</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Membership */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">Why Become a Member?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="text-center p-6">
              <Percent className="h-10 w-10 text-conve-red mx-auto mb-3" />
              <h3 className="font-bold mb-2">Save on Every Visit</h3>
              <p className="text-sm text-muted-foreground">15-25% off every service, every time. No credits, no complexity.</p>
            </Card>
            <Card className="text-center p-6">
              <Calendar className="h-10 w-10 text-conve-red mx-auto mb-3" />
              <h3 className="font-bold mb-2">Weekend Access</h3>
              <p className="text-sm text-muted-foreground">Book Saturday appointments (6 AM - 9:30 AM). Members only.</p>
            </Card>
            <Card className="text-center p-6">
              <Star className="h-10 w-10 text-conve-red mx-auto mb-3" />
              <h3 className="font-bold mb-2">Priority Scheduling</h3>
              <p className="text-sm text-muted-foreground">Get first access to same-day slots and preferred time windows.</p>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 md:py-16 bg-gray-50">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="space-y-3">
            {FAQS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border rounded-xl px-5 data-[state=open]:bg-white">
                <AccordionTrigger className="text-left text-base font-medium hover:no-underline py-4">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm leading-relaxed pb-4">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 bg-conve-red text-white">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-lg opacity-90 mb-8">Book a visit now or join a membership to save on every appointment.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button onClick={() => bookingModal?.openModal('pricing_cta')} size="lg" className="h-14 px-8 bg-white text-conve-red hover:bg-gray-100 font-semibold text-lg rounded-xl">
              Book Now <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button onClick={() => window.location.href = '/signup'} size="lg" variant="outline" className="h-14 px-8 border-2 border-white text-white hover:bg-white/10 font-semibold text-lg rounded-xl">
              Join Membership
            </Button>
          </div>
          <p className="text-sm opacity-75 mt-6">Or call <a href="tel:+19415279169" className="underline font-semibold">(941) 527-9169</a></p>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Pricing;
