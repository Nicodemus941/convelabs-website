import React from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';

/**
 * COMPARISON TABLE — "Quest & LabCorp vs. ConveLabs"
 *
 * Hormozi's signature move: category demolition. Create a villain
 * (the lab experience everyone hates), stack the evidence against it,
 * and let the visitor's own memory of waiting rooms + multiple sticks
 * do the selling for you.
 *
 * Placement: directly after TrustBanner, before HowItWorks. This is
 * the "villain moment" — the page pivots from "here's who trusts us"
 * to "here's why the alternative is broken."
 *
 * Mobile: collapses to side-by-side comparison cards; table on desktop.
 */

interface Row {
  label: string;
  lab: string;
  us: string;
  labBad?: boolean;
  usGood?: boolean;
}

const ROWS: Row[] = [
  { label: 'Time at the blood draw',     lab: '2+ hours (w/ wait)',  us: '10 minutes or less', labBad: true, usGood: true },
  { label: 'First-try draw success',     lab: '60% (3–4 sticks)',    us: '99% (one try)',      labBad: true, usGood: true },
  { label: 'Same-day appointments',      lab: 'Rarely',              us: 'Always',             labBad: true, usGood: true },
  { label: 'Privacy & setting',          lab: 'Public waiting room', us: 'Your home',          labBad: true, usGood: true },
  { label: 'Pediatric & elderly care',   lab: 'Stressful',           us: 'Calm, no tears',     labBad: true, usGood: true },
  { label: 'Results turnaround',         lab: '3–5 days',            us: '48 hours',           labBad: true, usGood: true },
  { label: 'If they arrive late',        lab: 'You wait',            us: 'Your visit is FREE', labBad: true, usGood: true },
  { label: 'Insurance handling',         lab: 'Your problem',        us: 'We send info to lab', labBad: true, usGood: true },
  { label: 'NFL-trusted phlebotomist',   lab: 'No',                  us: 'Yes',                labBad: true, usGood: true },
];

const ComparisonTable: React.FC = () => {
  return (
    <section className="py-14 sm:py-20 bg-gray-950 text-white relative overflow-hidden">
      {/* Decorative gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-950 to-black" />
      <div className="absolute -top-32 -right-20 w-96 h-96 bg-conve-red/10 rounded-full blur-3xl" />

      <div className="relative container mx-auto px-4">
        <motion.div
          className="max-w-3xl mx-auto text-center mb-10 sm:mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-conve-red mb-3">
            Why Patients Switch
          </p>
          <h2 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
            The Lab vs. <span className="text-conve-red">ConveLabs.</span>
          </h2>
          <p className="text-base md:text-lg text-gray-300">
            Here's exactly what you gain when the phlebotomist comes to you.
          </p>
        </motion.div>

        {/* Desktop: Table */}
        <motion.div
          className="hidden md:block max-w-5xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] backdrop-blur-sm">
            {/* Header */}
            <div className="grid grid-cols-[1.2fr_1fr_1fr] bg-black/40 border-b border-white/10">
              <div className="px-6 py-5" />
              <div className="px-6 py-5 text-center border-l border-white/10">
                <p className="text-xs tracking-widest uppercase text-gray-400 mb-1">The Lab</p>
                <p className="text-base font-semibold text-gray-300">Quest / LabCorp</p>
              </div>
              <div className="px-6 py-5 text-center bg-conve-red/10 border-l border-conve-red/30">
                <p className="text-xs tracking-widest uppercase text-conve-red mb-1">Premium Mobile</p>
                <p className="text-base font-bold text-white">ConveLabs</p>
              </div>
            </div>

            {/* Rows */}
            {ROWS.map((row, i) => (
              <div
                key={row.label}
                className={`grid grid-cols-[1.2fr_1fr_1fr] ${
                  i !== ROWS.length - 1 ? 'border-b border-white/5' : ''
                }`}
              >
                <div className="px-6 py-4 text-sm text-gray-200 font-medium">{row.label}</div>
                <div className="px-6 py-4 text-sm text-gray-400 border-l border-white/5 flex items-center gap-2">
                  {row.labBad && <X className="h-4 w-4 text-red-500 flex-shrink-0" />}
                  <span>{row.lab}</span>
                </div>
                <div className="px-6 py-4 text-sm text-white font-semibold bg-conve-red/5 border-l border-conve-red/20 flex items-center gap-2">
                  {row.usGood && <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />}
                  <span>{row.us}</span>
                </div>
              </div>
            ))}
          </div>

          <motion.p
            className="text-center text-lg md:text-xl font-semibold text-white mt-8 italic"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            "Patients who try ConveLabs <span className="text-conve-red">don't go back to the lab.</span>"
          </motion.p>
        </motion.div>

        {/* Mobile: Side-by-side cards */}
        <motion.div
          className="md:hidden max-w-md mx-auto space-y-3"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {ROWS.map((row) => (
            <div
              key={row.label}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                {row.label}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-start gap-2">
                  <X className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Lab</p>
                    <p className="text-xs text-gray-400">{row.lab}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 border-l border-conve-red/30 pl-3">
                  <Check className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-conve-red mb-0.5">ConveLabs</p>
                    <p className="text-xs text-white font-semibold">{row.us}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <p className="text-center text-base font-semibold text-white pt-4 italic">
            "Patients who try ConveLabs <span className="text-conve-red">don't go back to the lab.</span>"
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default ComparisonTable;
