
import { ServiceContentType } from "@/components/locations/ServiceContent";

export const doctorPhillipsAreas = [
  "Bay Hill",
  "Sand Lake",
  "Phillips Landing",
  "The Fountains",
  "Orlando Vineland",
  "Restaurant Row",
  "Grande Lakes",
  "Williamsburg",
  "Universal Studios (nearby)",
  "International Drive (nearby)",
  "Windermere (nearby)",
  "MetroWest"
];

export const doctorPhillipsServicesContent: Record<string, ServiceContentType> = {
  "home-blood-draws": {
    title: "At-Home Blood Draws in Doctor Phillips",
    description: "Experience the convenience of premium at-home blood draw services throughout Doctor Phillips. Our professional phlebotomists bring essential lab services directly to your residence, providing the upscale service that Doctor Phillips residents deserve.",
    benefits: [
      "Avoid Sand Lake Road traffic and medical facility waiting rooms",
      "Complete privacy in your Doctor Phillips home",
      "Early morning appointments for fasting labs",
      "Same high-quality equipment as clinical settings",
      "Premium service matching Doctor Phillips' luxury lifestyle"
    ],
    process: [
      "Schedule your appointment online or by phone",
      "Our phlebotomist arrives at your Doctor Phillips home at the scheduled time",
      "Sample collection is performed using hospital-grade techniques",
      "Your samples are properly handled and transported to the lab",
      "Results are delivered directly to your physician and your patient portal"
    ],
    faqs: [
      {
        question: "Do you serve all neighborhoods in Doctor Phillips?",
        answer: "Yes, we provide at-home blood draw services throughout Doctor Phillips including Bay Hill, Sand Lake, Phillips Landing, The Fountains, and all surrounding communities."
      },
      {
        question: "How quickly will my Doctor Phillips home appointment be scheduled?",
        answer: "For Doctor Phillips residents, we typically offer appointments within 24-48 hours of request, with same-day service often available for urgent needs. Members receive priority scheduling."
      },
      {
        question: "Is there an extra fee for at-home service in Doctor Phillips?",
        answer: "Our membership plans for Doctor Phillips residents include at-home blood draws as part of your benefits. For non-members, there is a convenience fee for at-home service, but this is often covered by premium insurance plans."
      }
    ]
  },
  "office-services": {
    title: "Office Blood Draw Services in Doctor Phillips",
    description: "ConveLabs brings professional blood collection services directly to your Doctor Phillips workplace or office. Our discreet, efficient service allows you and your employees to receive necessary lab work without dealing with Restaurant Row traffic.",
    benefits: [
      "Minimize workplace disruption and maximize productivity",
      "No employee travel time through Sand Lake Road traffic",
      "Schedule multiple employees during one visit",
      "Discreet, professional service at your Doctor Phillips office",
      "Paperwork and insurance handled seamlessly"
    ],
    process: [
      "Schedule your office visit through our Doctor Phillips coordinator",
      "We'll arrange a dedicated space within your office",
      "Our phlebotomist arrives with all necessary equipment",
      "Employees receive their services at scheduled intervals",
      "Samples are transported safely to the lab for processing"
    ],
    faqs: [
      {
        question: "How much space is needed for an office blood draw in Doctor Phillips?",
        answer: "We require a small, private area approximately 8x10 feet with a chair and small table. Our Doctor Phillips coordinator can help determine if your office space is suitable."
      },
      {
        question: "What is the minimum number of employees needed?",
        answer: "For Doctor Phillips businesses, we can accommodate as few as 3 employees per visit, with discounted rates for larger groups of 10 or more."
      },
      {
        question: "Can you coordinate with our Doctor Phillips company's wellness program?",
        answer: "Absolutely! We partner with many Doctor Phillips corporate wellness programs to provide scheduled testing throughout the year, with custom reporting options available."
      }
    ]
  }
};
