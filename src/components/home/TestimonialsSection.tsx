
import React from "react";
import { Star, Quote, ExternalLink } from "lucide-react";
import { VideoSection } from "@/components/ui/video-section";
import { motion } from "framer-motion";

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
    name: "SKA",
    rating: 5,
    text: "It was one of my best experiences with a blood draw. Mr. Nico, who came to draw my blood, was extremely kind and took great care of me. Definitely will be using their services again.",
    initial: "S",
    color: "bg-green-500",
  },
  {
    name: "Melissa Neptune",
    badge: "Local Guide",
    rating: 5,
    text: "Update: three years later. EVERY one of their clients (including me) loves Convelabs. You will, too. Don't go to the lab — Convelab will come to you and you will have a smooth, painless experience. Great customer service and a painless blood draw. I highly recommend this ultra-convenient service.",
    initial: "M",
    color: "bg-teal-500",
  },
];

const TestimonialsSection = () => {
  return (
    <section className="py-12 sm:py-16 md:py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <motion.div
          className="max-w-3xl mx-auto text-center mb-8 sm:mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {/* Google rating badge */}
          <div className="inline-flex items-center gap-2 bg-white border rounded-full px-4 py-2 mb-6 shadow-sm">
            <img src="https://www.google.com/favicon.ico" alt="Google" className="h-4 w-4" />
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />)}
            </div>
            <span className="font-bold text-sm">5.0</span>
            <span className="text-muted-foreground text-sm">(164 reviews)</span>
          </div>

          <h2 className="text-3xl md:text-4xl font-bold mb-4">What Our Patients Say</h2>
          <p className="text-lg text-muted-foreground">
            Real reviews from real patients on Google. We're proud of our 5-star rating.
          </p>
        </motion.div>

        {/* Video Testimonials */}
        <motion.div
          className="grid md:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 mb-10 max-w-6xl mx-auto"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex flex-col h-full">
            <div className="bg-white p-4 rounded-xl shadow-md mb-3">
              <VideoSection
                videoId="Src-0AB2irI"
                title="Client Success Story"
                description="Listen to how our service has transformed this client's healthcare experience."
                className="py-0"
              />
            </div>
          </div>
          <div className="flex flex-col h-full">
            <div className="bg-white p-4 rounded-xl shadow-md mb-3">
              <VideoSection
                videoId="pVf9KnZzc5A"
                title="NFL Player Experience"
                description="Former NFL linebacker Deiontrez Mount shares his experience with ConveLabs' concierge lab services."
                className="py-0"
              />
            </div>
          </div>
        </motion.div>

        {/* Google Reviews Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
          {GOOGLE_REVIEWS.map((review, i) => (
            <motion.div
              key={review.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`h-10 w-10 rounded-full ${review.color} flex items-center justify-center text-white font-bold text-sm`}>
                  {review.initial}
                </div>
                <div>
                  <p className="font-semibold text-sm">{review.name}</p>
                  {review.badge && (
                    <p className="text-xs text-muted-foreground">{review.badge}</p>
                  )}
                </div>
                <img src="https://www.google.com/favicon.ico" alt="Google" className="h-4 w-4 ml-auto" />
              </div>

              {/* Stars */}
              <div className="flex gap-0.5 mb-3">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>

              {/* Quote */}
              <p className="text-sm text-gray-700 leading-relaxed flex-1">
                "{review.text}"
              </p>
            </motion.div>
          ))}
        </div>

        {/* View all on Google */}
        <div className="text-center mt-8">
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
    </section>
  );
};

export default TestimonialsSection;
