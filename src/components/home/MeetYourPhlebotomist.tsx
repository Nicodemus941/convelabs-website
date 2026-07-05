import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Award, Users, CheckCircle2 } from 'lucide-react';

/**
 * MEET YOUR PHLEBOTOMIST — Founder Credibility Card
 *
 * Placed directly below the hero. The hero does the claim. This
 * section puts a face + credentials behind it, so the visitor
 * connects "NFL-grade service" → "delivered by THIS specific person."
 *
 * Hormozi principle: social proof stack precedes personal photo. By the
 * time the visitor's eyes land on the founder's face, they've already
 * been told he's trusted by NFL athletes, 1M+-follower influencers,
 * and 164 five-star reviews. Status signals do the framing.
 *
 * Photo asset: /public/images/team/nico-founder.jpg
 */

const FOUNDER_PHOTO = '/images/team/nico-founder.jpg';

const MeetYourPhlebotomist: React.FC = () => {
  return (
    <section className="py-12 sm:py-16 md:py-20 bg-brand-cream">
      <div className="container mx-auto px-4">
        <motion.div
          className="max-w-5xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="grid md:grid-cols-[minmax(0,320px)_1fr] gap-6 md:gap-10 items-center bg-brand-cream-soft rounded-2xl border border-brand-gold/25 p-6 md:p-8 lg:p-10 shadow-luxury">
            {/* Photo — portrait aspect so the face isn't cropped */}
            <div className="flex justify-center md:justify-start">
              <div className="relative w-full max-w-[280px]">
                <div className="absolute -inset-1 bg-gradient-to-br from-brand-gold/25 to-transparent rounded-2xl blur-sm"></div>
                <img
                  src={FOUNDER_PHOTO}
                  alt="Nico Jean-Baptiste — Founder & Lead Phlebotomist, ConveLabs"
                  className="relative w-full aspect-[3/4] object-cover object-center rounded-2xl shadow-lg ring-1 ring-brand-gold/30"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </div>

            {/* Bio + Credibility */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="h-px w-8 bg-brand-gold/60" />
                <p className="text-xs font-medium tracking-[0.24em] uppercase text-brand-gold-deep">
                  Meet Your Phlebotomist
                </p>
              </div>
              <h2 className="font-playfair text-3xl md:text-4xl font-medium text-conve-black mb-1">
                Nico Jean-Baptiste
              </h2>
              <p className="text-sm text-brand-gray-warm mb-5 tracking-wide">
                Founder · Lead Phlebotomist · Florida Licensed
              </p>

              {/* Credibility bullets */}
              <div className="space-y-2.5 mb-6">
                <div className="flex items-start gap-2.5">
                  <Award className="h-4 w-4 text-brand-gold-deep mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-brand-charcoal">
                    <span className="font-semibold">Trusted by NFL athletes</span> —
                    including Deiontrez Mount (Titans · Colts · Broncos)
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Users className="h-4 w-4 text-brand-gold-deep mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-brand-charcoal">
                    <span className="font-semibold">Endorsed by fitness entrepreneur Michael Morelli</span> —
                    1M+ follower founder of Morellifit & Detox Organics
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-brand-gold-deep mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-brand-charcoal">
                    <span className="font-semibold">500+ successful home visits</span> across Central Florida
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Shield className="h-4 w-4 text-brand-gold-deep mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-brand-charcoal">
                    <span className="font-semibold">HIPAA-compliant.</span>{' '}
                    Licensed phlebotomist. One-try draws on the first attempt.
                  </p>
                </div>
              </div>

              {/* Personal quote */}
              <blockquote className="border-l-2 border-brand-gold pl-4 font-playfair italic text-brand-charcoal text-base md:text-lg leading-relaxed">
                "Every patient deserves a bedside-manner draw — calm, painless,
                and on their schedule. That's why I built ConveLabs."
              </blockquote>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default MeetYourPhlebotomist;
