
import React from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { services } from "./ServiceGrid";

interface TestimonialType {
  quote: string;
  name: string;
  title: string;
}

// Sample testimonials that can be matched to services
const testimonials: Record<string, TestimonialType> = {
  "at-home-blood-draws": {
    quote: "The convenience of having lab draws at my home has been life-changing. The phlebotomists are professional and courteous.",
    name: "Jennifer K.",
    title: "Executive, Orlando"
  },
  "in-office-blood-draws": {
    quote: "Our entire office appreciates the time saved by having ConveLabs come to us. It's a valuable employee benefit.",
    name: "Michael T.",
    title: "HR Director"
  },
  "routine-lab-draws": {
    quote: "My quarterly panels are so simple now. No more waiting rooms or taking time off work.",
    name: "Robert S.",
    title: "Business Owner"
  },
  "fasting-labs": {
    quote: "The early morning appointments for my fasting labs are perfect. I can get my tests done before starting my day.",
    name: "Lisa M.",
    title: "Financial Advisor"
  },
  "stat-blood-draws": {
    quote: "When I needed urgent lab work, ConveLabs was at my home within hours. Exceptional service when it matters most.",
    name: "David R.",
    title: "Attorney"
  },
  "therapeutic-phlebotomy": {
    quote: "Managing my hemochromatosis has never been easier. The team is skilled and makes the process comfortable.",
    name: "William P.",
    title: "Retiree"
  },
  "urine-collections": {
    quote: "The discreet handling of urine collections is greatly appreciated. Professional service from start to finish.",
    name: "Sarah J.",
    title: "Healthcare Professional"
  },
  "stool-sample-collection": {
    quote: "The container drop-off and pickup service made an awkward process much more dignified.",
    name: "Thomas C.",
    title: "Professor"
  },
  "glucose-pregnancy-tests": {
    quote: "Having my gestational diabetes tests at home was a relief. No long waits at the lab during my pregnancy.",
    name: "Emily W.",
    title: "Expectant Mother"
  },
  "genetic-test-kit-processing": {
    quote: "ConveLabs handled my genetic testing kit professionally. The entire process was seamless.",
    name: "Nancy F.",
    title: "Patient"
  },
  "life-insurance-exam-labs": {
    quote: "The VIP service for my life insurance exam was exceptional. Made the whole process stress-free.",
    name: "George M.",
    title: "Business Executive"
  },
  "specialty-kit-shipping": {
    quote: "Knowing my samples were properly handled and shipped same-day gave me peace of mind.",
    name: "Patricia L.",
    title: "Patient"
  }
};

// Additional content for each service page
const serviceContent: Record<string, {
  overview: string;
  benefits: string[];
  idealFor: string[];
}> = {
  "at-home-blood-draws": {
    overview: "Our premium at-home blood draw service brings clinical laboratory testing to your doorstep. Enjoy the privacy and convenience of having a skilled phlebotomist come to your home on your schedule.",
    benefits: [
      "Complete privacy in your own space",
      "Flexible scheduling including early mornings",
      "No waiting rooms or exposure to other patients",
      "Same professional equipment and techniques as clinical settings"
    ],
    idealFor: [
      "Busy professionals with demanding schedules",
      "Individuals with mobility issues",
      "Parents who need to stay home with children",
      "Anyone who values privacy and convenience"
    ]
  },
  "in-office-blood-draws": {
    overview: "Bring healthcare efficiency to your workplace with our in-office blood draw services. We set up a professional, discreet collection station at your office, allowing employees to get their lab work done without leaving work.",
    benefits: [
      "Saves valuable employee time and increases productivity",
      "Encourages preventative healthcare compliance",
      "Professional setup and rapid service",
      "Minimal disruption to the workday"
    ],
    idealFor: [
      "Corporate wellness programs",
      "Law firms and professional service companies",
      "Executive health initiatives",
      "Medical practices wanting to offer in-house lab services"
    ]
  },
  "routine-lab-draws": {
    overview: "Whether it's annual physicals, quarterly hormone panels, or monthly monitoring, our routine lab draw service ensures consistent, convenient testing on your schedule.",
    benefits: [
      "Regular scheduling with reminders",
      "Consistency in collection techniques",
      "Digital result tracking over time",
      "Direct integration with your physician's office"
    ],
    idealFor: [
      "Patients on medication requiring regular monitoring",
      "Health-conscious individuals tracking biomarkers",
      "Those with chronic conditions requiring frequent labs",
      "Executives with comprehensive health programs"
    ]
  },
  "fasting-labs": {
    overview: "Fasting labs require precise timing and can disrupt your morning routine. Our early-morning appointments come to you, making the process as comfortable as possible while maintaining accurate results.",
    benefits: [
      "Early morning appointments beginning at 4:00 AM",
      "No driving while fasting",
      "Immediate post-draw nutrition options available",
      "Minimal disruption to your daily routine"
    ],
    idealFor: [
      "Busy professionals who need to be at work early",
      "Diabetic patients requiring fasting glucose tests",
      "Patients with comprehensive metabolic panel requirements",
      "Those with lipid panels or other fasting requirements"
    ]
  },
  "stat-blood-draws": {
    overview: "When urgent lab work is needed, our STAT blood draw service provides rapid response and priority processing, ensuring your samples reach the lab quickly for expedited results.",
    benefits: [
      "Same-day service for urgent needs",
      "Priority lab processing arrangements",
      "Direct communication with ordering physicians",
      "Result notification as soon as available"
    ],
    idealFor: [
      "Patients with rapidly changing conditions",
      "Pre-surgical testing requirements",
      "Urgent medication adjustments",
      "Time-sensitive diagnostic needs"
    ]
  },
  "therapeutic-phlebotomy": {
    overview: "For patients with conditions like hemochromatosis, polycythemia, or porphyria, our therapeutic phlebotomy service offers physician-directed blood volume reduction in the comfort of your home or office.",
    benefits: [
      "Specialized equipment for therapeutic procedures",
      "Experienced phlebotomists trained in blood volume reduction",
      "Comfortable, private setting",
      "Coordination with treating physicians"
    ],
    idealFor: [
      "Patients with hereditary hemochromatosis",
      "Those with polycythemia vera",
      "Individuals with porphyria cutanea tarda",
      "Patients under physician care requiring regular blood removal"
    ]
  },
  "urine-collections": {
    overview: "Our discreet urine collection service provides everything needed for proper specimen collection, including timed collections requiring special handling and temperature control.",
    benefits: [
      "Professional collection kits and containers",
      "Clear instructions and assistance if needed",
      "Proper temperature control during transport",
      "Chain of custody documentation when required"
    ],
    idealFor: [
      "Patients requiring 24-hour urine collections",
      "Those needing first morning specimens",
      "Individuals with mobility issues",
      "Anyone preferring privacy for sensitive tests"
    ]
  },
  "stool-sample-collection": {
    overview: "Our stool sample collection service handles this sensitive testing need with dignity and professionalism, providing collection materials, clear instructions, and prompt transportation to the laboratory.",
    benefits: [
      "Discreet handling and transportation",
      "Professional collection containers and preservation materials",
      "Proper temperature control during transport",
      "Prompt delivery to testing facility"
    ],
    idealFor: [
      "Patients with GI disorders requiring monitoring",
      "Those undergoing colorectal cancer screening",
      "Individuals with suspected parasitic infections",
      "Anyone preferring privacy for this sensitive collection"
    ]
  },
  "glucose-pregnancy-tests": {
    overview: "Our specialized glucose pregnancy testing service brings the laboratory glucose challenge and tolerance tests to expectant mothers, eliminating the need to sit in clinical waiting rooms for hours.",
    benefits: [
      "Comfortable home environment for multi-hour tests",
      "Professional administration of glucose solution",
      "Precisely timed blood draws",
      "Distraction-free environment during waiting periods"
    ],
    idealFor: [
      "Expectant mothers requiring gestational diabetes screening",
      "High-risk pregnancies requiring multiple glucose tests",
      "Women with difficult pregnancy symptoms",
      "Busy professionals who can't spend hours at a lab facility"
    ]
  },
  "genetic-test-kit-processing": {
    overview: "Our genetic test kit processing service assists with proper collection techniques for various genetic testing companies, ensuring optimal sample quality and proper shipping protocols.",
    benefits: [
      "Professional assistance with complex collection requirements",
      "Verification of proper sample collection",
      "Secure packaging according to lab specifications",
      "Expedited shipping to testing facilities"
    ],
    idealFor: [
      "Patients using direct-to-consumer genetic tests",
      "Those requiring specialized genetic panels",
      "Individuals with physician-ordered genetic screening",
      "Families undergoing relationship testing"
    ]
  },
  "life-insurance-exam-labs": {
    overview: "Our life insurance exam lab service provides a premium experience for insurance applicants, with flexible scheduling and professional collection that meets all carrier requirements.",
    benefits: [
      "Complete privacy during sensitive insurance exams",
      "All required vitals and measurements",
      "Professional blood and urine collection",
      "Direct reporting to insurance carriers"
    ],
    idealFor: [
      "High-value policy applicants",
      "Busy professionals applying for executive policies",
      "Those preferring discretion during insurance processes",
      "Clients of wealth management firms and insurance agents"
    ]
  },
  "specialty-kit-shipping": {
    overview: "Our specialty kit shipping service ensures time-sensitive and temperature-controlled samples are properly processed, packaged, and shipped to specialized laboratories nationwide.",
    benefits: [
      "Same-day processing and shipping",
      "Centrifugation when required",
      "Temperature-controlled packaging",
      "Tracking and delivery confirmation"
    ],
    idealFor: [
      "Patients requiring specialized testing not available locally",
      "Those participating in research studies",
      "Individuals with rare conditions requiring specialized labs",
      "Anyone with time-sensitive samples requiring same-day shipping"
    ]
  }
};

export const ServicePage: React.FC = () => {
  const { serviceSlug } = useParams<{ serviceSlug: string }>();
  
  // Find the matching service
  const service = services.find(s => s.slug === serviceSlug);
  
  // If no matching service is found, redirect to services
  if (!service) {
    return <Navigate to="/pricing" replace />;
  }

  // Get the testimonial and content for this service
  const testimonial = testimonials[serviceSlug || ""] || testimonials["at-home-blood-draws"];
  const content = serviceContent[serviceSlug || ""] || serviceContent["at-home-blood-draws"];
  
  return (
    <DashboardWrapper>
      <div className="container mx-auto py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Back button */}
          <Link to="/pricing" className="inline-flex items-center text-muted-foreground hover:text-primary mb-8">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Pricing
          </Link>
          
          {/* Service header */}
          <div className="flex items-center mb-8">
            <div className="bg-primary/10 p-4 rounded-lg mr-6">
              <div className="h-12 w-12 flex items-center justify-center">
                {service.icon}
              </div>
            </div>
            <h1 className="text-4xl font-bold">{service.title}</h1>
          </div>
          
          {/* Service overview */}
          <p className="text-xl mb-10 text-muted-foreground">{content.overview}</p>
          
          {/* Benefits and ideal users */}
          <div className="grid md:grid-cols-2 gap-10 mb-12">
            <div>
              <h2 className="text-2xl font-semibold mb-4">Key Benefits</h2>
              <ul className="space-y-2">
                {content.benefits.map((benefit, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-primary text-xl mr-2">•</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h2 className="text-2xl font-semibold mb-4">Ideal For</h2>
              <ul className="space-y-2">
                {content.idealFor.map((user, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-primary text-xl mr-2">•</span>
                    <span>{user}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          {/* Testimonial */}
          <div className="bg-primary/5 p-8 rounded-lg mb-12 border border-primary/10">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary/30">
                  <path d="M10 11H6C6 11 6 9.28 6.73 8.27C7.46 7.26 8.87 6.85 9.74 6.57C10.08 6.46 10.24 6.06 10.13 5.73C10.02 5.39 9.62 5.23 9.29 5.34C8.13 5.68 6.37 6.23 5.34 7.68C4.32 9.13 4.32 11 4 14V17C4 17.55 4.45 18 5 18H9C9.55 18 10 17.55 10 17V12C10 11.45 9.55 11 9 11" fill="currentColor"/>
                  <path d="M20 11H16C16 11 16 9.28 16.73 8.27C17.46 7.26 18.87 6.85 19.74 6.57C20.08 6.46 20.24 6.06 20.13 5.73C20.02 5.39 19.62 5.23 19.29 5.34C18.13 5.68 16.37 6.23 15.34 7.68C14.32 9.13 14.32 11 14 14V17C14 17.55 14.45 18 15 18H19C19.55 18 20 17.55 20 17V12C20 11.45 19.55 11 19 11" fill="currentColor"/>
                </svg>
              </div>
              <p className="text-lg italic mb-4">{testimonial.quote}</p>
              <div>
                <p className="font-medium">{testimonial.name}</p>
                <p className="text-sm text-muted-foreground">{testimonial.title}</p>
              </div>
            </div>
          </div>
          
          {/* CTA */}
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to Experience Personalized Care?</h2>
            <p className="text-lg mb-8 max-w-xl mx-auto">
              Join thousands of members who have simplified their lab testing experience with our membership plans.
            </p>
            <Button size="lg" asChild className="font-semibold">
              <Link to="/pricing">View Membership Plans</Link>
            </Button>
          </div>
        </div>
      </div>
    </DashboardWrapper>
  );
};
