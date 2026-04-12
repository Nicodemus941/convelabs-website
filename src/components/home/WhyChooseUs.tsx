
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Syringe, ShieldCheck, Timer, LineChart } from "lucide-react";

const WhyChooseUs = () => {
  const benefits = [
    {
      icon: <Clock className="h-10 w-10 text-conve-red" />,
      title: "Guaranteed On-Time Arrival",
      description: "Our phlebotomists arrive at your scheduled time, every time. No more waiting or missed appointments."
    },
    {
      icon: <Syringe className="h-10 w-10 text-conve-red" />,
      title: "99% First-Stick Success",
      description: "Our experienced professionals achieve successful blood draws on the first attempt, virtually painless."
    },
    {
      icon: <ShieldCheck className="h-10 w-10 text-conve-red" />,
      title: "Secure Sample Tracking",
      description: "Advanced tracking system ensures your specimens are never lost and properly processed at the lab."
    },
    {
      icon: <Timer className="h-10 w-10 text-conve-red" />,
      title: "Quick 5-7 Minute Service",
      description: "We respect your time with efficient service that takes just minutes, not hours in a waiting room."
    },
    {
      icon: <LineChart className="h-10 w-10 text-conve-red" />,
      title: "Expedited Results",
      description: "Get your lab results faster through our streamlined processing and digital delivery system."
    }
  ];

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Why Choose ConveLabs</h2>
          <p className="text-lg text-gray-700">
            We've addressed the common frustrations with traditional lab services to provide 
            a superior experience you can trust.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit, index) => (
            <Card key={index} className="border-0 shadow-md hover:shadow-lg transition-shadow duration-300">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="mb-4 p-3 bg-red-50 rounded-full">
                    {benefit.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-2">{benefit.title}</h3>
                  <p className="text-gray-600">{benefit.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyChooseUs;
