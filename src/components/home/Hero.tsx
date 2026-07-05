import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Stethoscope } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { GHS_BOOKING_PAGE } from "@/lib/constants/urls";
import { supabase } from "@/integrations/supabase/client";

/**
 * HERO — Post-Hormozi / NFL-endorsement Rebuild
 *
 * Positioning: not "mobile blood draw" — "better than NFL-grade mobile
 * medical care at your door." The category-killing testimonial from
 * Deiontrez Mount (NFL LB, Titans/Colts/Broncos) does the heavy lifting.
 *
 * Video loop (muted, silent-autoplay) shows real draw footage so the
 * service proof is burned in before the visitor reads a single word.
 * Falls back to a poster image on slow connections or /public path missing.
 *
 * Asset placement (populate when ready):
 *   /public/videos/hero-loop.mp4     — 10-15s silent loop of a real draw
 *   /public/videos/hero-loop.webm    — WebM fallback (optional)
 *   /public/images/hero-poster.jpg   — first frame / static fallback
 */

const HERO_VIDEO_MP4 = "/videos/hero-loop.mp4";
const HERO_VIDEO_WEBM = "/videos/hero-loop.webm";
const HERO_POSTER = "/images/hero-poster.jpg";

const Hero = () => {
  const [visitCount, setVisitCount] = useState(500);

  useEffect(() => {
    supabase.from('appointments').select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .then(({ count }) => {
        if (count && count > 100) setVisitCount(count);
      });
  }, []);

  const handleBookNow = () => {
    window.location.href = GHS_BOOKING_PAGE;
  };

  // YC critique 2026-05-25: secondary CTA should be a forward step toward
  // purchase, not lateral scrolling. Swapped from "Watch Reviews" to
  // "How It Works" — scrolls to the value-stack section that explains the
  // product. Reviews are still accessible further down, but the conversion
  // path is now: book OR understand the product. Both push toward a yes.
  const scrollToHowItWorks = () => {
    const el = document.getElementById('how-it-works');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { when: "beforeChildren", staggerChildren: 0.10 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: "easeOut" },
    },
  };

  return (
    <section className="relative overflow-hidden bg-black">
      {/* Video background (silent autoplay loop) */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          poster={HERO_POSTER}
          className="w-full h-full object-cover opacity-50"
          aria-hidden="true"
        >
          <source src={HERO_VIDEO_WEBM} type="video/webm" />
          <source src={HERO_VIDEO_MP4} type="video/mp4" />
        </video>
        {/* Deep ink overlay — richer, more editorial than a flat scrim.
            Vertical gradient for text legibility + a subtle warm vignette
            so the crimson/gold accents read as intentional, not neon. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/65 to-black/90" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,transparent_45%,rgba(0,0,0,0.55)_100%)]" />
      </div>

      <div className="relative z-10 py-24 sm:py-28 md:py-32 lg:py-40">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            className="max-w-4xl mx-auto text-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Eyebrow — gold hairline rulesframing an all-caps kicker.
                Signals the category + geography before the headline lands. */}
            <motion.div
              variants={itemVariants}
              className="flex items-center justify-center gap-4 mb-7"
            >
              <span className="h-px w-8 sm:w-12 bg-brand-gold/50" />
              <span className="text-[0.7rem] sm:text-xs font-medium uppercase tracking-[0.28em] text-brand-gold-soft">
                Mobile Phlebotomy · Central Florida
              </span>
              <span className="h-px w-8 sm:w-12 bg-brand-gold/50" />
            </motion.div>

            {/* H1 — editorial serif with a gold-italic accent phrase.
                Same message, elevated to a five-star-hospitality register. */}
            <motion.h1
              variants={itemVariants}
              className="font-playfair text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium leading-[1.08] tracking-tight text-white mb-7"
            >
              Blood draws at your{" "}
              <span className="italic text-brand-gold">kitchen table.</span>
              <br />
              Not a waiting room.
            </motion.h1>

            {/* Subtitle — the critical insurance-clarity line that answers
                "why pay when LabCorp is free?" Immediate category separation. */}
            <motion.p
              variants={itemVariants}
              className="text-lg sm:text-xl md:text-2xl font-light text-white/90 max-w-2xl mx-auto mb-7 leading-relaxed"
            >
              Your doctor ordered labs — we come to you.
              <span className="block mt-2 text-base sm:text-lg text-white/75">
                Your insurance still covers the tests. We're the phlebotomist who skips the drive.
              </span>
            </motion.p>

            {/* Dual CTA — refined: crimson primary with letter-spaced caps,
                gold-hairline ghost secondary. Sharper radius reads couture. */}
            <motion.div
              variants={itemVariants}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10 mt-2"
            >
              <Button
                onClick={handleBookNow}
                size="lg"
                className="h-14 px-10 bg-conve-red hover:bg-conve-red-dark text-white font-semibold text-sm uppercase tracking-[0.15em] rounded-lg shadow-luxury-red hover:shadow-luxury-red-hover transition-all w-full sm:w-auto"
              >
                Book My Home Visit
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                onClick={scrollToHowItWorks}
                size="lg"
                variant="outline"
                className="h-14 px-8 font-semibold text-sm uppercase tracking-[0.15em] rounded-lg border border-brand-gold/40 bg-transparent text-white hover:bg-brand-gold/10 hover:border-brand-gold/70 transition-all w-full sm:w-auto"
              >
                <Stethoscope className="mr-2 h-5 w-5" />
                How It Works
              </Button>
            </motion.div>

            {/* Credibility stripe — Hormozi 3-anchor rule. NFL athlete +
                @morellifit moved to the Meet Your Phlebotomist section below
                where they have full context (Mount's teams, Morelli's brands).
                Hero stripe keeps the 3 most universally trust-building
                signals for a cold stranger landing from Google. */}
            <motion.div
              variants={itemVariants}
              className="flex flex-wrap justify-center items-center gap-x-5 gap-y-2 text-sm text-white/75"
            >
              <span className="flex items-center gap-1.5">
                <span className="text-brand-gold">★</span>
                <span className="font-semibold text-white tabular-nums">5.0</span>
                <span className="text-white/60">from 164 reviews</span>
              </span>
              <span className="text-brand-gold/40">·</span>
              <span className="font-semibold text-white tabular-nums">{visitCount.toLocaleString()}+ home visits</span>
              <span className="text-brand-gold/40">·</span>
              <span className="text-white/75">HIPAA Compliant</span>
            </motion.div>

            {/* Live urgency badge */}
            <motion.div variants={itemVariants} className="mt-9">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-sm rounded-full border border-brand-gold/25">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-gold opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-gold"></span>
                </span>
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/85">
                  Same-day appointments — Central Florida
                </span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
