import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, PlayCircle } from "lucide-react";
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

  const scrollToReviews = () => {
    const el = document.getElementById('testimonials');
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
          className="w-full h-full object-cover opacity-60"
          aria-hidden="true"
        >
          <source src={HERO_VIDEO_WEBM} type="video/webm" />
          <source src={HERO_VIDEO_MP4} type="video/mp4" />
        </video>
        {/* Dark gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
      </div>

      <div className="relative z-10 py-20 sm:py-24 md:py-28 lg:py-32">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            className="max-w-4xl mx-auto text-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Category-killer quote badge */}
            <motion.div variants={itemVariants}>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20 mb-6">
                <span className="text-lg">🏈</span>
                <span className="text-sm font-semibold text-white">
                  "Better than what I got in the NFL."
                </span>
                <span className="text-xs text-white/70 hidden sm:inline">— Deiontrez Mount, NFL LB</span>
              </div>
            </motion.div>

            {/* H1 — the NFL-grade claim */}
            <motion.h1
              variants={itemVariants}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight text-white mb-6"
            >
              Better Than <span className="text-conve-red">NFL-Grade.</span>
              <br />
              At Your Door.
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={itemVariants}
              className="text-lg sm:text-xl md:text-2xl text-white/90 max-w-2xl mx-auto mb-8 leading-relaxed"
            >
              Licensed phlebotomist at your door in 60 minutes.
              One-try blood draws. Results in 48 hours.
              <br className="hidden sm:block" />
              <span className="inline-flex items-center gap-1.5 mt-2 text-white font-semibold">
                <Shield className="h-4 w-4 text-green-400" />
                On-time — or your visit is free.
              </span>
            </motion.p>

            {/* Dual CTA */}
            <motion.div
              variants={itemVariants}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
            >
              <Button
                onClick={handleBookNow}
                size="lg"
                className="h-14 px-10 bg-conve-red hover:bg-conve-red-dark text-white font-semibold text-lg rounded-xl shadow-luxury-red hover:shadow-luxury-red-hover transition-all w-full sm:w-auto"
              >
                Book My Home Visit
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                onClick={scrollToReviews}
                size="lg"
                variant="outline"
                className="h-14 px-8 font-semibold text-lg rounded-xl border-2 border-white/30 bg-white/10 backdrop-blur-sm text-white hover:bg-white hover:text-gray-900 w-full sm:w-auto"
              >
                <PlayCircle className="mr-2 h-5 w-5" />
                Watch Reviews
              </Button>
            </motion.div>

            {/* Compact credibility stripe */}
            <motion.div
              variants={itemVariants}
              className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-white/80"
            >
              <span className="flex items-center gap-1.5">
                <span className="text-yellow-400">⭐</span>
                <span className="font-semibold text-white">5.0</span>
                <span className="text-white/70">(164 reviews)</span>
              </span>
              <span className="text-white/40">·</span>
              <span>🏈 Trusted by NFL athletes</span>
              <span className="text-white/40">·</span>
              <span>💪 Endorsed by <span className="font-semibold text-white">@morellifit</span> <span className="text-white/60">(970K)</span></span>
              <span className="text-white/40">·</span>
              <span>🛡️ HIPAA Compliant</span>
              <span className="text-white/40">·</span>
              <span className="text-white">{visitCount.toLocaleString()}+ home visits</span>
            </motion.div>

            {/* Live urgency badge */}
            <motion.div variants={itemVariants} className="mt-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 backdrop-blur-sm rounded-full border border-green-400/30">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400"></span>
                </span>
                <span className="text-sm font-semibold text-green-100">
                  Same-day appointments available
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
