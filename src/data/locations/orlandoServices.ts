
import { ServiceContentType } from "@/components/locations/ServiceContent";

export const orlandoAreas = [
  "Downtown Orlando",
  "Lake Nona",
  "College Park", 
  "Baldwin Park",
  "Thornton Park",
  "SoDo District",
  "Milk District",
  "Conway",
  "Delaney Park",
  "Audubon Park",
  "Winter Park (border)",
  "Dr. Phillips (nearby)"
];

export const orlandoServicesContent: Record<string, ServiceContentType> = {
  "home-blood-draws": {
    title: "At-Home Blood Draws in Orlando",
    description: "Experience the convenience of premium at-home blood draw services throughout Orlando. Our professional phlebotomists bring essential lab services directly to your residence, eliminating the need to navigate downtown traffic or spend time in crowded waiting rooms.",
    benefits: [
      "Avoid downtown Orlando traffic and medical facility waiting rooms",
      "Complete privacy in your Orlando home",
      "Early morning appointments for fasting labs",
      "Same high-quality equipment as clinical settings",
      "Flexible scheduling that works with your busy lifestyle"
    ],
    process: [
      "Schedule your appointment online or by phone",
      "Our phlebotomist arrives at your Orlando home at the scheduled time",
      "Sample collection is performed using hospital-grade techniques",
      "Your samples are properly handled and transported to the lab",
      "Results are delivered directly to your physician and your patient portal"
    ],
    faqs: [
      {
        question: "Do you serve all neighborhoods in Orlando?",
        answer: "Yes, we provide at-home blood draw services throughout Orlando including Lake Nona, Baldwin Park, College Park, Thornton Park, and all surrounding communities."
      },
      {
        question: "How quickly will my Orlando home appointment be scheduled?",
        answer: "For Orlando residents, we typically offer appointments within 24-48 hours of request, with same-day service often available for urgent needs. Members receive priority scheduling."
      },
      {
        question: "Is there an extra fee for at-home service in Orlando?",
        answer: "Our membership plans for Orlando residents include at-home blood draws as part of your benefits. For non-members, there is a convenience fee for at-home service, but this is often covered by premium insurance plans."
      }
    ]
  },
  "office-services": {
    title: "Office Blood Draw Services in Orlando",
    description: "ConveLabs brings professional blood collection services directly to your Orlando workplace or office. Our discreet, efficient service allows you and your employees to receive necessary lab work without leaving the downtown area or dealing with Orlando traffic.",
    benefits: [
      "Minimize workplace disruption and maximize productivity",
      "No employee travel time through Orlando traffic",
      "Schedule multiple employees during one visit",
      "Discreet, professional service at your Orlando office",
      "Paperwork and insurance handled seamlessly"
    ],
    process: [
      "Schedule your office visit through our Orlando coordinator",
      "We'll arrange a dedicated space within your office",
      "Our phlebotomist arrives with all necessary equipment",
      "Employees receive their services at scheduled intervals",
      "Samples are transported safely to the lab for processing"
    ],
    faqs: [
      {
        question: "How much space is needed for an office blood draw in Orlando?",
        answer: "We require a small, private area approximately 8x10 feet with a chair and small table. Our Orlando coordinator can help determine if your office space is suitable."
      },
      {
        question: "What is the minimum number of employees needed?",
        answer: "For Orlando businesses, we can accommodate as few as 3 employees per visit, with discounted rates for larger groups of 10 or more."
      },
      {
        question: "Can you coordinate with our Orlando company's wellness program?",
        answer: "Absolutely! We partner with many Orlando corporate wellness programs to provide scheduled testing throughout the year, with custom reporting options available."
      }
    ]
  }
};
