import React from "react";
import { Users, Star, TrendingUp, Award } from "lucide-react";

export const SocialProofStats = () => {
  const stats = [
    {
      icon: <Users className="h-8 w-8" />,
      value: "500+ Executives & 50+ Companies",
      label: "Elite Clients Served",
      color: "text-blue-600",
    },
    {
      icon: <Star className="h-8 w-8" />,
      value: "5.0/5",
      label: "Elite Rating",
      color: "text-amber-500",
    },
    {
      icon: <TrendingUp className="h-8 w-8" />,
      value: "100%",
      label: "Privacy Compliance",
      color: "text-green-600",
    },
    {
      icon: <Award className="h-8 w-8" />,
      value: "Same-Day",
      label: "Concierge Service",
      color: "text-purple-600",
    },
  ];

  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-playfair font-bold text-gray-900 mb-4">
            The #1 Choice for Orlando's Elite Professionals & Leading Corporations
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            From Fortune 500 executives to professional athletes and corporate wellness programs, ConveLabs is the trusted partner for structured luxury lab services and enterprise health solutions
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="flex flex-col items-center text-center p-6 bg-gray-50 rounded-xl hover:shadow-lg transition-shadow duration-300"
            >
              <div className={`${stat.color} mb-4`}>{stat.icon}</div>
              <div className="text-4xl font-bold text-gray-900 mb-2">
                {stat.value}
              </div>
              <div className="text-sm font-medium text-gray-600">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Launch announcement */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-conve-red/10 to-purple-50 border border-conve-red/20 rounded-full">
            <span className="text-sm font-semibold text-gray-800">
              🎉 Now serving Orlando, Tampa, and surrounding areas
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
