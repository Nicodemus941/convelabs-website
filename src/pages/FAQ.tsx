
import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";

// FAQ data organized by category
const faqData = {
  general: [
    {
      question: "What is ConveLabs?",
      answer: "ConveLabs is a mobile phlebotomy service that brings lab testing to you. We provide convenient at-home, in-office, or hotel blood draws and other specimen collections conducted by professional phlebotomists."
    },
    {
      question: "Where does ConveLabs operate?",
      answer: "ConveLabs currently serves Central Florida including Orlando, Tampa, and surrounding areas. We're expanding to new regions regularly."
    },
    {
      question: "Do I need a doctor's order for lab work?",
      answer: "Yes, ConveLabs requires a valid doctor's order for all lab testing. If you don't have an order, our concierge doctor partners can help determine appropriate testing."
    },
    {
      question: "How quickly will I receive my results?",
      answer: "Once your specimens are delivered to the lab, we send you a confirmation text and email with your lab-generated tracking ID. Results timing varies by lab and test type, and are available through your lab's patient portal."
    }
  ],
  membership: [
    {
      question: "What membership plans does ConveLabs offer?",
      answer: "ConveLabs offers three patient memberships plus a practice plan: Regular ($9.99/year), VIP ($19.99/year), Concierge ($49.99/year), and Practice Partner pricing for medical offices."
    },
    {
      question: "How do visits work?",
      answer: "Memberships do not include visit credits. Instead, they unlock lower visit pricing, broader booking windows, and tier-specific perks whenever you book a draw."
    },
    {
      question: "Do unused visits roll over?",
      answer: "There are no visit credits to roll over. Your membership benefits stay active for the full annual term and apply every time you schedule."
    },
    {
      question: "What happens if I need more visits than my plan includes?",
      answer: "You can always book more visits at your active member rate, or upgrade if you want better scheduling access or richer perks."
    }
  ],
  billing: [
    {
      question: "How much does a membership cost?",
      answer: "Regular is $9.99/year, VIP is $19.99/year, and Concierge is $49.99/year. Practice Partner pricing is separate for medical offices. Non-member mobile visits start at $150 each."
    },
    {
      question: "Is there a fee for home visits?",
      answer: "Membership lowers the per-visit price, but it does not make home visits free. Non-members pay $150 for a standard mobile draw, while members pay their tier-specific discounted rate."
    },
    {
      question: "Will my insurance cover ConveLabs services?",
      answer: "ConveLabs operates outside traditional insurance networks. However, you may be able to use HSA/FSA funds or submit receipts to your insurance for potential reimbursement."
    },
    {
      question: "Are there any hidden fees?",
      answer: "No, ConveLabs is transparent about all costs. Your membership covers the specified number of visits. The non-member rate is $150 per visit with no hidden charges."
    }
  ],
  appointments: [
    {
      question: "How do I schedule an appointment?",
      answer: "You can schedule appointments through our online portal or by calling our customer service team. Members have access to priority scheduling and same-day availability."
    },
    {
      question: "What are the scheduling hours?",
      answer: "Members enjoy 7-day scheduling: Monday-Sunday, 6:00 AM - 1:30 PM (excluding holidays). Non-members are limited to Monday-Friday, 8:30 AM - 1:30 PM."
    },
    {
      question: "Can I request a specific phlebotomist?",
      answer: "Concierge Elite members get a dedicated phlebotomist. For other plans, we'll do our best to accommodate your preferred phlebotomist based on availability."
    },
    {
      question: "What is the appointment cancellation policy?",
      answer: "We request 24 hours notice for cancellations. Late cancellations may result in a visit being deducted from your account."
    }
  ]
};

const FAQPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("general");
  
  // Filter FAQs based on search term
  const getFilteredFaqs = () => {
    const allFaqs = Object.values(faqData).flat();
    
    if (!searchTerm) {
      return activeCategory === "all" 
        ? allFaqs 
        : faqData[activeCategory as keyof typeof faqData] || [];
    }
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    return allFaqs.filter(
      faq => 
        faq.question.toLowerCase().includes(lowerSearchTerm) || 
        faq.answer.toLowerCase().includes(lowerSearchTerm)
    );
  };
  
  const filteredFaqs = getFilteredFaqs();
  
  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Frequently Asked Questions | ConveLabs</title>
        <meta 
          name="description" 
          content="Find answers to frequently asked questions about ConveLabs mobile phlebotomy services, membership plans, appointment scheduling, and billing in Central Florida." 
        />
        <meta name="keywords" content="ConveLabs FAQ, mobile phlebotomy questions, lab testing FAQ, Central Florida lab services, at-home blood draw questions" />
        <link rel="canonical" href="https://convelabs.com/faq" />
      </Helmet>
      
      <Header />
      
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-2 text-center">Frequently Asked Questions</h1>
          <p className="text-lg text-gray-600 text-center mb-8">
            Find answers to common questions about our services, memberships, and more.
          </p>

          {/* Search Bar */}
          <div className="relative mb-8">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Search questions..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {/* Category Tabs */}
          <Tabs defaultValue="general" value={activeCategory} onValueChange={setActiveCategory} className="mb-8">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="membership">Membership</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
              <TabsTrigger value="appointments">Appointments</TabsTrigger>
            </TabsList>
          </Tabs>
          
          {/* FAQ Accordions */}
          {filteredFaqs.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {filteredFaqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left font-medium text-lg">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-700">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No results found for "{searchTerm}". Try a different search term.</p>
            </div>
          )}
          
          <div className="mt-12 bg-gray-50 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Still have questions?</h2>
            <p className="mb-4">
              If you couldn't find the answer you were looking for, our customer support team is ready to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="/contact" 
                className="bg-conve-red hover:bg-red-700 text-white px-6 py-3 rounded-md text-center transition-colors"
              >
                Contact Us
              </a>
              <a 
                href="tel:+19415279169" 
                className="border border-gray-300 hover:bg-gray-100 px-6 py-3 rounded-md text-center transition-colors"
              >
                Call (941) 527-9169
              </a>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default FAQPage;
