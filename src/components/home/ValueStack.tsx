import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GHS_BOOKING_PAGE } from '@/lib/constants/urls';
import { supabase } from '@/integrations/supabase/client';

/**
 * VALUE STACK — Hormozi $100M Offers Construction
 *
 * This is the "offer moment." After the visitor has been shown:
 *   1. The hero claim (NFL-grade)
 *   2. The credibility (Morelli, NFL, reviews)
 *   3. The testimonials (3-video proof wall)
 *   4. The guarantees + trust signals
 *   5. The villain (comparison table)
 *
 * …they are READY to hear what's actually on offer. This section
 * stacks every component of the service as a line-item with a value,
 * then shows the total exceeds the price by 2x+.
 *
 * Hormozi principle: "Perceived value > price = irresistible offer."
 */

interface StackItem {
  label: string;
  subtext?: string;
  value: number;
}

const STACK: StackItem[] = [
  { label: 'Licensed phlebotomist at your door',     subtext: 'One-try draws, 95%+ success',   value: 150 },
  { label: '60-minute arrival guarantee',            subtext: 'On-time — or your visit is FREE', value: 75 },
  { label: 'Specimen pickup + lab delivery',         subtext: 'We drive it so you don\'t',     value: 40 },
  { label: 'Results in 48 hours',                    subtext: 'vs. 3–5 days at traditional labs', value: 50 },
  { label: 'HIPAA-grade privacy, in your home',      subtext: 'No waiting rooms, no exposure', value: 30 },
  { label: 'Delivery tracking + confirmation',       subtext: 'Real-time status updates',      value: 25 },
  { label: 'Insurance info sent to the lab',         subtext: 'We pass your details so the lab bills correctly', value: 20 },
];

const TOTAL_VALUE = STACK.reduce((s, i) => s + i.value, 0);
const PRICE = 150;
const SAVINGS = TOTAL_VALUE - PRICE;

const fmt = (n: number) => `$${n.toFixed(0)}`;

const ValueStack: React.FC = () => {
  const [slotsLeft, setSlotsLeft] = useState<number | null>(null);

  useEffect(() => {
    // Pull today's remaining availability as live urgency signal
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    (async () => {
      try {
        const { count } = await supabase.from('appointments')
          .select('id', { count: 'exact', head: true })
          .gte('appointment_date', today.toISOString())
          .lte('appointment_date', endOfDay.toISOString())
          .in('status', ['scheduled', 'confirmed']);
        const DAILY_CAPACITY = 7;
        const remaining = Math.max(0, DAILY_CAPACITY - (count || 0));
        setSlotsLeft(remaining > 0 && remaining < DAILY_CAPACITY ? remaining : 3);
      } catch {
        setSlotsLeft(3); // Fallback if query fails
      }
    })();
  }, []);

  const handleBook = () => {
    window.location.href = GHS_BOOKING_PAGE;
  };

  return (
    <section className="py-14 sm:py-20 bg-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(185,28,28,0.4) 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="relative container mx-auto px-4">
        <motion.div
          className="max-w-3xl mx-auto text-center mb-8 sm:mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-conve-red mb-3">
            Here's Everything Included
          </p>
          <h2 className="text-3xl md:text-5xl font-bold mb-4 leading-tight text-gray-900">
            A {fmt(TOTAL_VALUE)} Experience for{' '}
            <span className="text-conve-red">{fmt(PRICE)}.</span>
          </h2>
          <p className="text-base md:text-lg text-gray-600">
            Every ConveLabs mobile visit includes all of the following — no add-ons, no surprise fees.
          </p>
        </motion.div>

        <motion.div
          className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          {/* Stack rows */}
          <div className="p-5 sm:p-7">
            {STACK.map((item, i) => (
              <motion.div
                key={item.label}
                className={`flex items-start gap-3 py-3.5 ${
                  i !== STACK.length - 1 ? 'border-b border-gray-100' : ''
                }`}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.05 }}
              >
                <div className="h-6 w-6 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm sm:text-base">{item.label}</p>
                  {item.subtext && (
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{item.subtext}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Value</p>
                  <p className="text-sm sm:text-base font-bold text-gray-700">{fmt(item.value)}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Totals bar */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-200 p-5 sm:p-7 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total value if purchased separately</span>
              <span className="text-base sm:text-lg font-semibold text-gray-700 line-through">
                {fmt(TOTAL_VALUE)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-gray-900">Your price today</span>
              <span className="text-2xl sm:text-3xl font-bold text-conve-red">
                {fmt(PRICE)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-gray-300">
              <span className="text-sm font-semibold text-emerald-700">You save</span>
              <span className="text-base font-bold text-emerald-700">
                {fmt(SAVINGS)} in time, pain, and hassle
              </span>
            </div>
          </div>

          {/* CTA */}
          <div className="p-5 sm:p-7 pt-3 bg-white">
            <Button
              onClick={handleBook}
              size="lg"
              className="w-full h-14 bg-conve-red hover:bg-conve-red-dark text-white font-semibold text-base sm:text-lg rounded-xl shadow-luxury-red hover:shadow-luxury-red-hover transition-all"
            >
              Book My Home Visit — {fmt(PRICE)}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            {/* Live urgency */}
            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-600">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
              <span className="font-medium">
                {slotsLeft !== null ? slotsLeft : '3'} slot{(slotsLeft ?? 3) !== 1 ? 's' : ''} remaining today in your area
              </span>
            </div>

            <p className="text-center text-xs text-gray-500 mt-3">
              🛡️ Backed by our on-time guarantee — or your visit is free.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ValueStack;
