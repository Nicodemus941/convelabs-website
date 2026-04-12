
import React from "react";
import { Shield, RefreshCcw, Clock, Headphones } from "lucide-react";
import MaintenanceFeature from "./MaintenanceFeature";

const MonthlyMaintenance: React.FC = () => {
  const features = [
    {
      icon: <Shield className="w-5 h-5 text-conve-red" />,
      title: "HIPAA Compliance Monitoring",
      description: "Ongoing security updates and compliance monitoring to keep your platform secure."
    },
    {
      icon: <RefreshCcw className="w-5 h-5 text-conve-red" />,
      title: "Regular Updates",
      description: "Monthly software updates, security patches, and feature enhancements."
    },
    {
      icon: <Clock className="w-5 h-5 text-conve-red" />,
      title: "99.9% Uptime Guarantee",
      description: "Enterprise-grade hosting with redundant systems to ensure your platform is always available."
    },
    {
      icon: <Headphones className="w-5 h-5 text-conve-red" />,
      title: "Priority Support",
      description: "Access to our technical support team for any issues or questions."
    }
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">Monthly Maintenance Package</h2>
              <p className="text-lg text-gray-600 mb-8">
                Your platform requires ongoing maintenance to ensure optimal performance, 
                security, and compliance. Our monthly maintenance fee covers:
              </p>
              
              <div className="space-y-6">
                {features.map((feature, index) => (
                  <MaintenanceFeature
                    key={index}
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.description}
                  />
                ))}
              </div>
            </div>
            
            <div className="bg-gray-50 p-8 rounded-xl border border-gray-200">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-2">Infrastructure Support</h3>
                <div className="flex items-baseline justify-center">
                  <span className="text-4xl font-bold">$400</span>
                  <span className="text-gray-600 ml-1">/month</span>
                </div>
              </div>
              
              <ul className="space-y-3 mb-6">
                <li className="flex items-center">
                  <div className="w-5 h-5 bg-conve-red rounded-full mr-2 flex-shrink-0"></div>
                  <span>Dedicated cloud hosting</span>
                </li>
                <li className="flex items-center">
                  <div className="w-5 h-5 bg-conve-red rounded-full mr-2 flex-shrink-0"></div>
                  <span>Data backup & recovery</span>
                </li>
                <li className="flex items-center">
                  <div className="w-5 h-5 bg-conve-red rounded-full mr-2 flex-shrink-0"></div>
                  <span>Technical support</span>
                </li>
                <li className="flex items-center">
                  <div className="w-5 h-5 bg-conve-red rounded-full mr-2 flex-shrink-0"></div>
                  <span>Security monitoring</span>
                </li>
              </ul>
              
              <div className="bg-gray-100 p-4 rounded-lg text-sm">
                <p>First payment due 30 days after platform delivery. Cancel anytime with 30-day notice.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MonthlyMaintenance;
