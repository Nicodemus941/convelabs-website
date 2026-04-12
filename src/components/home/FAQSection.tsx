import React from "react";
import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "How much does a mobile blood draw cost?",
    a: "A mobile blood draw starts at $125 per visit. Additional patients at the same location are just $35 each. Lab test fees are separate and depend on which tests your doctor orders. We have no hidden fees — the price you see is the price you pay.",
  },
  {
    q: "What areas do you serve?",
    a: "We serve Orlando, Winter Park, Windermere, Dr. Phillips, Bay Hill, Lake Nona, Celebration, Heathrow, Kissimmee, Lake Mary, Altamonte Springs, Sanford, Oviedo, Maitland, Clermont, and surrounding Central Florida communities.",
  },
  {
    q: "How quickly can a phlebotomist come to me?",
    a: "We offer same-day appointments when available. Most appointments can be scheduled within 24 hours. Early morning fasting appointments are available starting at 6:00 AM.",
  },
  {
    q: "Is mobile phlebotomy covered by insurance?",
    a: "Many insurance plans cover the lab tests themselves. The mobile blood draw service fee ($125) is typically an out-of-pocket convenience fee. We can provide a superbill for insurance reimbursement.",
  },
  {
    q: "What lab tests can you perform?",
    a: "Our phlebotomists can draw blood for virtually any lab test your doctor orders — including CBC, metabolic panels, lipid panels, thyroid panels, hormone testing, STD panels, and over 200 other tests through our CLIA-certified partner labs.",
  },
  {
    q: "Do I need a doctor's order?",
    a: "For most lab tests, yes — a doctor's lab order is required. If you don't have one, we can help connect you with a physician who can order the tests you need.",
  },
];

const FAQSection = () => {
  return (
    <section id="faq" className="py-16 sm:py-20 bg-white">
      <div className="container mx-auto px-4 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-muted-foreground">
            Everything you need to know about our mobile blood draw service.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="border border-border rounded-xl px-5 data-[state=open]:bg-muted/30"
              >
                <AccordionTrigger className="text-left text-base font-medium text-foreground hover:no-underline py-4">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm leading-relaxed pb-4">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
};

export default FAQSection;
