import React from "react";
import { Star, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

/**
 * TESTIMONIALS — Three-Persona Proof Wall
 *
 * Hormozi principle: three testimonials, three personas, zero waste.
 * Each video converts a different buyer:
 *
 *   Michelle (real patient)     — fear-reducer for hesitant patient
 *   Morelli (1M+ influencer)    — premium validator for wellness crowd
 *   Deiontrez Mount (NFL LB)    — status proof for athletes/performance
 *
 * The NFL quote is the category killer: "Better than what I got in the NFL."
 * No competitor in mobile phlebotomy can match this credibility cascade.
 *
 * VIDEO SOURCES (populate when uploaded):
 *   Michelle — YouTube unlisted or Supabase Storage (video id below)
 *   Morelli  — YouTube unlisted or Supabase Storage (video id below)
 *   Mount    — already on site, YouTube id pVf9KnZzc5A
 *
 * Replace the VIDEO_IDS below with actual YouTube IDs when uploads are ready.
 */

interface TestimonialVideo {
  videoId: string;
  pullQuote: string;
  name: string;
  context: string;
  badge?: string;
  badgeColor?: string;
  /** YouTube Shorts are vertical (9:16) — triggers different aspect ratio so it doesn't letterbox. */
  vertical?: boolean;
}

const TESTIMONIAL_VIDEOS: TestimonialVideo[] = [
  {
    // Deiontrez Mount — the category killer. Put him first.
    videoId: "pVf9KnZzc5A",
    pullQuote: "Better than what I got in the NFL.",
    name: "Deiontrez Mount",
    context: "NFL Linebacker · Titans · Colts · Broncos",
    badge: "🏈 NFL Athlete",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    // Michael Morelli — 1M+ influencer, $25M entrepreneur
    videoId: "VJ7whL0fzfc",
    pullQuote: "Drove to Tampa to have Nico do my labs. Never going back to a lab.",
    name: "Michael Morelli",
    context: "1M+ followers · Founder, Morellifit & Detox Organics",
    badge: "💪 @morellifit",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
  },
  {
    // Christine Payas — real patient authenticity (YouTube Short, vertical 9:16)
    videoId: "Q69uYpUzxIc",
    pullQuote: "Painless. The best blood draw I've ever had.",
    name: "Christine Payas",
    context: "Florida Patient · At-home blood draw",
    badge: "🩸 Real Patient",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    vertical: true,
  },
];

const GOOGLE_REVIEWS = [
  {
    name: "Richard Harary",
    badge: "Local Guide",
    rating: 5,
    text: "This company is absolutely incredible. Every single time, they deliver flawless service, fast, precise, and unbelievably professional. The blood draw is completely painless, and they get the vein on the first try every time. Simply put, they are the best at what they do. Highly recommended.",
    initial: "R",
    color: "bg-amber-500",
  },
  {
    name: "Jes Lawrence",
    badge: "Local Guide",
    rating: 5,
    text: "A+! I used ConveLabs for my at-home blood work. The entire process was super convenient — booking was easy, confirmation receipt was swift and my technician arrived on time. Nico was professional, friendly, and made the whole experience super comfortable. I highly recommend ConveLabs!",
    initial: "J",
    color: "bg-blue-500",
  },
  {
    name: "Amy Polen",
    rating: 5,
    text: "As someone who has a severe fear of blood and needles, getting labwork done is my personal nightmare. However, ConveLabs and Nic have really helped me feel comfortable in my own home and cared for whenever I have to get my regular lab work done. They've played a crucial part in me working through my fear.",
    initial: "A",
    color: "bg-purple-500",
  },
  {
    name: "David Congdon",
    rating: 5,
    text: "After terrible and rude service from Adventhealth phlebotomy, we looked for excellent service from a provider we could count on. Convelabs met our every need. They were on time, kind, knowledgeable and did a blood draw with very little pain. We would strongly recommend Nic and Convelabs. Well worth the price.",
    initial: "D",
    color: "bg-red-500",
  },
  {
    name: "Melissa Neptune",
    badge: "Local Guide",
    rating: 5,
    text: "Update: three years later. EVERY one of their clients (including me) loves Convelabs. You will, too. Don't go to the lab — Convelab will come to you and you will have a smooth, painless experience. Great customer service and a painless blood draw. I highly recommend this ultra-convenient service.",
    initial: "M",
    color: "bg-teal-500",
  },
  {
    name: "SKA",
    rating: 5,
    text: "It was one of my best experiences with a blood draw. Mr. Nico, who came to draw my blood, was extremely kind and took great care of me. Definitely will be using their services again.",
    initial: "S",
    color: "bg-green-500",
  },
];

const TestimonialsSection: React.FC = () => {
  return (
    <section id="testimonials" className="py-12 sm:py-16 md:py-20 bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          className="max-w-3xl mx-auto text-center mb-10 sm:mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 bg-white border rounded-full px-4 py-2 mb-5 shadow-sm">
            <img src="https://www.google.com/favicon.ico" alt="Google" className="h-4 w-4" />
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map(i => <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />)}
            </div>
            <span className="font-bold text-sm">5.0</span>
            <span className="text-muted-foreground text-sm">(164 reviews)</span>
          </div>

          <h2 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
            From the NFL to Your Neighbor.
          </h2>
          <p className="text-lg text-muted-foreground">
            Athletes, entrepreneurs, and everyday patients on why they chose ConveLabs.
          </p>
        </motion.div>

        {/* 3-Video Proof Wall */}
        <div className="grid md:grid-cols-3 gap-5 sm:gap-6 max-w-6xl mx-auto mb-12">
          {TESTIMONIAL_VIDEOS.map((v, idx) => (
            <motion.div
              key={v.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: idx * 0.12 }}
              className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden flex flex-col hover:shadow-xl transition-shadow"
            >
              {/* Video — aspect ratio honors vertical Shorts (9:16) vs horizontal (16:9) */}
              <div
                className="relative bg-gray-900 overflow-hidden"
                style={{ paddingBottom: v.vertical ? '177.78%' : '56.25%' }}
              >
                {v.videoId.endsWith('_VIDEO_ID') ? (
                  // Placeholder card until video is uploaded
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-white p-6 text-center">
                    <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center mb-3">
                      <span className="text-2xl">▶</span>
                    </div>
                    <p className="text-sm font-semibold">Video uploading soon</p>
                    <p className="text-xs text-white/60 mt-1">{v.name}</p>
                  </div>
                ) : (
                  <iframe
                    src={`https://www.youtube.com/embed/${v.videoId}?rel=0&modestbranding=1&playsinline=1`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute top-0 left-0 w-full h-full border-0"
                    title={`${v.name} — ConveLabs Testimonial`}
                    loading="lazy"
                  />
                )}
              </div>

              {/* Pull quote + attribution */}
              <div className="p-5 flex-1 flex flex-col">
                {v.badge && (
                  <span
                    className={`inline-flex w-fit items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${v.badgeColor || 'bg-gray-50 text-gray-700 border-gray-200'} mb-3`}
                  >
                    {v.badge}
                  </span>
                )}
                <blockquote className="text-lg md:text-xl font-semibold text-gray-900 leading-snug mb-4 flex-1">
                  "{v.pullQuote}"
                </blockquote>
                <div className="pt-3 border-t border-gray-100">
                  <p className="font-semibold text-sm text-gray-900">{v.name}</p>
                  <p className="text-xs text-muted-foreground">{v.context}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Google Reviews Grid (supporting volume social proof) */}
        <div className="max-w-6xl mx-auto">
          <h3 className="text-center text-sm font-semibold tracking-wider uppercase text-muted-foreground mb-5">
            Plus 164 five-star reviews on Google
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {GOOGLE_REVIEWS.map((review, i) => (
              <motion.div
                key={review.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col"
              >
                <div className="flex items-center gap-3 mb-2.5">
                  <div className={`h-9 w-9 rounded-full ${review.color} flex items-center justify-center text-white font-bold text-sm`}>
                    {review.initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{review.name}</p>
                    {review.badge && (
                      <p className="text-[11px] text-muted-foreground">{review.badge}</p>
                    )}
                  </div>
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="h-4 w-4" />
                </div>
                <div className="flex gap-0.5 mb-2.5">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed flex-1">
                  "{review.text}"
                </p>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-6">
            <a
              href="https://g.page/r/CQmBXeW0b7YNEAE/review"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              View all 164 reviews on Google
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
