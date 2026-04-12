
import { ServiceContentType } from "@/components/locations/ServiceContent";

export const winterParkAreas = [
  "Park Avenue District",
  "Hannibal Square",
  "Winter Park Pines",
  "Baldwin Park",
  "Aloma",
  "Goldenrod",
  "Winter Park Estates",
  "Winter Park Village",
  "Casselberry (border)",
  "Maitland (nearby)",
  "College Park (nearby)",
  "Orlando (border)"
];

export const winterParkServicesContent: Record<string, ServiceContentType> = {
  "home-blood-draws": {
    title: "At-Home Blood Draws in Winter Park",
    description: "Experience the convenience of premium at-home blood draw services throughout Winter Park. Our professional phlebotomists bring essential lab services directly to your residence, providing the luxury and privacy that Winter Park residents expect.",
    benefits: [
      "Avoid Park Avenue traffic and medical facility waiting rooms",
      "Complete privacy in your Winter Park home",
      "Early morning appointments for fasting labs",
      "Same high-quality equipment as clinical settings",
      "White-glove service matching Winter Park's premium lifestyle"
    ],
    process: [
      "Schedule your appointment online or by phone",
      "Our phlebotomist arrives at your Winter Park home at the scheduled time",
      "Sample collection is performed using hospital-grade techniques",
      "Your samples are properly handled and transported to the lab",
      "Results are delivered directly to your physician and your patient portal"
    ],
    faqs: [
      {
        question: "Do you serve all neighborhoods in Winter Park?",
        answer: "Yes, we provide at-home blood draw services throughout Winter Park including the Park Avenue District, Hannibal Square, Winter Park Pines, and all surrounding communities."
      },
      {
        question: "How quickly will my Winter Park home appointment be scheduled?",
        answer: "For Winter Park residents, we typically offer appointments within 24-48 hours of request, with same-day service often available for urgent needs. Members receive priority scheduling."
      },
      {
        question: "Is there an extra fee for at-home service in Winter Park?",
        answer: "Our membership plans for Winter Park residents include at-home blood draws as part of your benefits. For non-members, there is a convenience fee for at-home service, but this is often covered by premium insurance plans."
      }
    ]
  },
  "office-services": {
    title: "Office Blood Draw Services in Winter Park",
    description: "ConveLabs brings professional blood collection services directly to your Winter Park workplace or office. Our discreet, efficient service allows you and your employees to receive necessary lab work without leaving the Winter Park area.",
    benefits: [
      "Minimize workplace disruption and maximize productivity",
      "No employee travel time or parking hassles",
      "Schedule multiple employees during one visit",
      "Discreet, professional service at your Winter Park office",
      "Paperwork and insurance handled seamlessly"
    ],
    process: [
      "Schedule your office visit through our Winter Park coordinator",
      "We'll arrange a dedicated space within your office",
      "Our phlebotomist arrives with all necessary equipment",
      "Employees receive their services at scheduled intervals",
      "Samples are transported safely to the lab for processing"
    ],
    faqs: [
      {
        question: "How much space is needed for an office blood draw in Winter Park?",
        answer: "We require a small, private area approximately 8x10 feet with a chair and small table. Our Winter Park coordinator can help determine if your office space is suitable."
      },
      {
        question: "What is the minimum number of employees needed?",
        answer: "For Winter Park businesses, we can accommodate as few as 3 employees per visit, with discounted rates for larger groups of 10 or more."
      },
      {
        question: "Can you coordinate with our Winter Park company's wellness program?",
        answer: "Absolutely! We partner with many Winter Park corporate wellness programs to provide scheduled testing throughout the year, with custom reporting options available."
      }
    ]
  }
};
