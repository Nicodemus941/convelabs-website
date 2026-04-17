import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, ArrowRight, CheckCircle, Gift } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const LeadCapture = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    try {
      // Fires the actual process-lead-capture edge function:
      //  1. Upserts into `leads` table
      //  2. Sends welcome email via Mailgun with WELCOME10 code + guide link
      //  3. Marks lead as welcome_sent
      const { data, error } = await supabase.functions.invoke('process-lead-capture', {
        body: {
          email: email.trim().toLowerCase(),
          source: 'homepage_lead_capture',
          referrer: window.location.href,
          userAgent: navigator.userAgent,
        },
      });
      if (error) console.warn('Lead capture error:', error);
      if (data?.welcomeEmailSent === false && data?.emailError) {
        console.warn('Welcome email failed:', data.emailError);
      }
      setIsSubmitted(true);
    } catch (err) {
      // Still show success — we logged the error; don't punish the user for our bugs
      console.error('Lead capture exception:', err);
      setIsSubmitted(true);
    }
    setIsSubmitting(false);
  };

  if (isSubmitted) {
    return (
      <section className="py-12 bg-gradient-to-r from-conve-red/5 to-red-50">
        <div className="container mx-auto px-4 max-w-xl text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">You're In!</h3>
          <p className="text-muted-foreground">
            Check your inbox for 10% off your first visit. Welcome to the ConveLabs family.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 bg-gradient-to-r from-conve-red/5 to-red-50">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border rounded-full text-sm mb-4">
            <Gift className="h-4 w-4 text-conve-red" />
            <span className="font-medium">Get 10% off your first visit</span>
          </div>

          <h3 className="text-2xl md:text-3xl font-bold mb-2">
            Not ready to book yet?
          </h3>
          <p className="text-muted-foreground mb-3">
            Get <span className="font-semibold text-foreground">10% off your first visit</span> + our free guide:
          </p>
          <p className="text-sm font-medium text-foreground mb-5">
            📋 "Understanding Your Blood Work Results" — what your doctor isn't telling you
          </p>

          <form onSubmit={handleSubmit} className="flex gap-3 max-w-md mx-auto">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12 rounded-xl"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-12 px-6 bg-conve-red hover:bg-conve-red-dark text-white rounded-xl"
            >
              {isSubmitting ? "..." : "Get 10% Off"}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </form>

          <p className="text-xs text-muted-foreground mt-3">
            No spam. Unsubscribe anytime. We respect your privacy.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default LeadCapture;
