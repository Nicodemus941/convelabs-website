
import { ServiceContentType } from "@/components/locations/ServiceContent";

export const windermereAreas = [
  "Windermere Proper",
  "Isleworth",
  "Keene's Pointe",
  "Summerport",
  "The Willows",
  "Lake Butler Sound",
  "Horizon West",
  "Lake Down"
];

export const windermereServicesContent: Record<string, ServiceContentType> = {
  "home-blood-draws": {
    title: "At-Home Blood Draws in Windermere",
    description: "Experience the convenience of premium at-home blood draw services throughout Windermere. Our professional phlebotomists bring essential lab services directly to your residence, eliminating the need to navigate traffic or spend time in waiting rooms.",
    benefits: [
      "Avoid traffic and medical facility waiting rooms",
      "Complete privacy in your Windermere home",
      "Early morning appointments for fasting labs",
      "Same high-quality equipment as clinical settings",
      "Flexible scheduling that works with your busy schedule"
    ],
    process: [
      "Schedule your appointment online or by phone",
      "Our phlebotomist arrives at your Windermere home at the scheduled time",
      "Sample collection is performed using hospital-grade techniques",
      "Your samples are properly handled and transported to the lab",
      "Results are delivered directly to your physician and your patient portal"
    ],
    faqs: [
      {
        question: "Do you serve all neighborhoods in Windermere?",
        answer: "Yes, we provide at-home blood draw services throughout Windermere including Isleworth, Keene's Pointe, and all surrounding communities."
      },
      {
        question: "How quickly will my Windermere home appointment be scheduled?",
        answer: "For Windermere residents, we typically offer appointments within 24-48 hours of request, with same-day service often available for urgent needs. Members receive priority scheduling."
      },
      {
        question: "Is there an extra fee for at-home service in Windermere?",
        answer: "Our membership plans for Windermere residents include at-home blood draws as part of your benefits. For non-members, there is a convenience fee for at-home service, but this is often covered by premium insurance plans."
      }
    ]
  },
  "office-services": {
    title: "Office Blood Draw Services in Windermere",
    description: "ConveLabs brings professional blood collection services directly to your Windermere workplace or office. Our discreet, efficient service allows you and your employees to receive necessary lab work without leaving the office.",
    benefits: [
      "Minimize workplace disruption and maximize productivity",
      "No employee travel time or waiting at labs",
      "Schedule multiple employees during one visit",
      "Discreet, professional service at your Windermere office",
      "Paperwork and insurance handled seamlessly"
    ],
    process: [
      "Schedule your office visit through our Windermere coordinator",
      "We'll arrange a dedicated space within your office",
      "Our phlebotomist arrives with all necessary equipment",
      "Employees receive their services at scheduled intervals",
      "Samples are transported safely to the lab for processing"
    ],
    faqs: [
      {
        question: "How much space is needed for an office blood draw in Windermere?",
        answer: "We require a small, private area approximately 8x10 feet with a chair and small table. Our Windermere coordinator can help determine if your office space is suitable."
      },
      {
        question: "What is the minimum number of employees needed?",
        answer: "For Windermere businesses, we can accommodate as few as 3 employees per visit, with discounted rates for larger groups of 10 or more."
      },
      {
        question: "Can you coordinate with our Windermere company's wellness program?",
        answer: "Absolutely! We partner with many Windermere corporate wellness programs to provide scheduled testing throughout the year, with custom reporting options available."
      }
    ]
  }
};
