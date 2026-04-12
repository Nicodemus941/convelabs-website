import React from "react";
import { Check, ArrowRight, Calculator, Star, Users, Shield, Clock, Zap, Crown, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ENROLLMENT_URL, withSource } from "@/lib/constants/urls";
import { useBookingModalSafe } from "@/contexts/BookingModalContext";

const PricingSection = () => {
  const bookingModal = useBookingModalSafe();

  const handleRedirectToMembership = () => {
    window.location.href = withSource(ENROLLMENT_URL, 'pricing_section');
  };

  const handleRedirectToBooking = () => {
    bookingModal?.openModal('pricing_section');
  };

  const membershipPlans = [
    {
      name: "Health Starter",
      subtitle: "Annual Routine Monitoring",
      price: "$499",
      period: "/year",
      visitsIncluded: "4 visits included",
      effectiveCost: "Members save 15-25%",
      annualSavings: "$101",
      icon: <Shield className="h-6 w-6" />,
      features: [
        "4 premium lab visits per year",
        "15-25% discount on all services",
        "Mon-Sun, 6 AM - 1:30 PM scheduling",
        "At-home or in-office visits",
        "Result tracking included"
      ],
      annualOnly: true,
      popular: false
    },
    {
      name: "Proactive Health",
      subtitle: "Best for Executives & Athletes",
      price: "$149",
      period: "/month",
      altPrice: "$1,499/year (save $289)",
      visitsIncluded: "12 visits included",
      effectiveCost: "Members save 15-25%",
      annualSavings: "$301",
      icon: <Crown className="h-6 w-6" />,
      popular: true,
      features: [
        "12 lab visits per year (1/month)",
        "15-25% discount on all services",
        "Same-day scheduling available",
        "Health insights dashboard",
        "Credit rollover (up to 3 months)",
        "Priority booking"
      ]
    },
    {
      name: "Concierge Elite",
      subtitle: "White-Glove VIP Service",
      price: "$299",
      period: "/month",
      altPrice: "$2,999/year (save $589)",
      visitsIncluded: "Unlimited visits",
      effectiveCost: "~$83/visit*",
      annualSavings: "Up to $1,700+",
      icon: <Star className="h-6 w-6" />,
      features: [
        "Unlimited lab visits",
        "Dedicated phlebotomist",
        "NDA available upon request",
        "Hotel, office & home visits",
        "White-glove concierge service",
        "Priority scheduling guaranteed"
      ]
    }
  ];

  const premiumFeatures = [
    {
      category: "Convenience Revolution",
      icon: <Zap className="h-5 w-5" />,
      benefits: [
        "Mobile phlebotomists come directly to your location",
        "No travel, no waiting rooms — healthcare at your convenience",
        "Professional certified technicians with years of experience",
        "Same-day scheduling available for members",
        "Members: Mon-Sun, 6:00 AM - 1:30 PM (excl. holidays)"
      ]
    },
    {
      category: "Cost Savings",
      icon: <Calculator className="h-5 w-5" />,
      benefits: [
        "Save up to 45% vs non-member pricing ($150/visit)",
        "No hidden fees or appointment charges",
        "Predictable costs with membership billing",
        "Credit rollover protection (up to 3 months)",
        "Annual billing discounts available"
      ]
    },
    {
      category: "Professional Service",
      icon: <Shield className="h-5 w-5" />,
      benefits: [
        "Bring your own lab orders from any healthcare provider",
        "Support for any lab work your doctor prescribes",
        "Expert blood draws in your home or office",
        "Secure sample handling and transport",
        "Coordination with major lab networks"
      ]
    },
    {
      category: "Member-Only Perks",
      icon: <Star className="h-5 w-5" />,
      benefits: [
        "7-day scheduling (vs Mon-Fri for non-members)",
        "Extended hours: 6:00 AM - 1:30 PM (vs 8:30 AM - 1:30 PM)",
        "Priority booking during high-demand periods",
        "Intelligent scheduling finds best available phlebotomist",
        "Exclusive member pricing on additional services"
      ]
    }
  ];

  const perfectFor = [
    "Executives who value time and convenience",
    "Athletes needing regular performance monitoring",
    "Celebrities and public figures requiring privacy",
    "Concierge physicians managing patient panels",
    "Individuals with mobility challenges",
    "Anyone wanting to skip clinic waiting rooms"
  ];

  const whyChoose = [
    "Certified & insured phlebotomists",
    "State-of-the-art mobile equipment",
    "Works with your existing healthcare providers",
    "HIPAA compliant data handling",
    "Customer satisfaction guarantee",
    "Flexible scheduling around your life"
  ];

  return (
    <section id="pricing" className="py-20 bg-gradient-to-br from-gray-50 to-white">
      <div className="container mx-auto px-4">
        {/* Hero Pricing Message */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            💎 Exclusive Membership Tiers
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-4">
            Premium Mobile Phlebotomy — Anchored to Our $150/Visit Standard Rate
          </p>
          <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-conve-red/10 to-purple-100 text-conve-red rounded-full text-sm font-medium">
            ⭐ Early Bird Enrollment — Lock in Founding Member Rates
          </div>
        </div>

        {/* Non-Member Baseline */}
        <div className="mb-8 text-center">
          <Card className="max-w-md mx-auto bg-gray-50 border-gray-200">
            <CardContent className="p-6">
              <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Non-Member Rate</p>
              <p className="text-3xl font-bold text-gray-900">$150<span className="text-base font-normal text-gray-600">/visit</span></p>
              <p className="text-sm text-gray-500 mt-2">Mon-Fri, 8:30 AM - 1:30 PM</p>
              <p className="text-xs text-gray-400 mt-1">Restoration Place service: 7:30 AM start available</p>
              <Button 
                onClick={handleRedirectToBooking}
                variant="outline"
                className="mt-4"
              >
                Book as Non-Member
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Membership Plans */}
        <div className="mb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {membershipPlans.map((plan, index) => (
              <Card key={index} className={`relative ${plan.popular ? 'border-conve-red border-2 transform scale-105 shadow-lg' : 'shadow-md hover:shadow-lg transition-shadow'}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-conve-red text-white">Most Popular</Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-4">
                  <div className="w-12 h-12 mx-auto mb-2 bg-conve-red/10 rounded-full flex items-center justify-center">
                    {plan.icon}
                  </div>
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <p className="text-sm text-gray-600">{plan.subtitle}</p>
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-2xl font-bold text-conve-red">{plan.price}</span>
                      <span className="text-sm text-gray-600">{plan.period}</span>
                    </div>
                    {plan.altPrice && (
                      <p className="text-xs text-gray-500">{plan.altPrice}</p>
                    )}
                  </div>
                  {plan.annualOnly && (
                    <p className="text-xs text-gray-600">Annual billing only</p>
                  )}
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium text-conve-red">{plan.visitsIncluded} • {plan.effectiveCost}</p>
                    <p className="text-xs text-green-600 font-medium">
                      Save {plan.annualSavings} annually vs non-member
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                  <Button 
                    onClick={handleRedirectToMembership}
                    className="w-full bg-conve-red hover:bg-conve-red/90 mt-6"
                  >
                    Choose {plan.name}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-gray-400 text-center mt-4">*Concierge Elite effective cost based on ~18 visits/year average usage</p>
        </div>

        {/* Practice Partner B2B Plan */}
        <div className="mb-16">
          <Card className="max-w-2xl mx-auto border-purple-200 bg-purple-50">
            <CardHeader className="text-center">
              <CardTitle className="text-xl flex items-center justify-center gap-2">
                <Building2 className="h-6 w-6 text-purple-600" />
                Practice Partner — For Medical Practices
              </CardTitle>
              <p className="text-2xl font-bold text-purple-700 mt-2">$100<span className="text-base font-normal text-purple-500">/patient/month</span></p>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                "12 visits per patient per year ($100 effective/visit)",
                "Minimum 5 patients, maximum 100 per practice",
                "White-label service integration",
                "Dedicated account management",
                "Priority scheduling and routing",
                "Bulk patient onboarding"
              ].map((feature, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
              <div className="text-center mt-6">
                <Button 
                  onClick={() => window.location.href = withSource(ENROLLMENT_URL, 'practice_partner')}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Contact Us for Practice Partner
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Premium Features & Benefits */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-center mb-8">🌟 Premium Features & Benefits</h3>
          <div className="grid md:grid-cols-2 gap-8">
            {premiumFeatures.map((category, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {category.icon}
                    {category.category}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {category.benefits.map((benefit, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{benefit}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Value Comparison Table */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-center mb-8">📊 Value Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full max-w-5xl mx-auto bg-white rounded-lg shadow">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm">Feature</th>
                  <th className="px-4 py-3 text-center text-sm">Non-Member</th>
                  <th className="px-4 py-3 text-center text-sm">Health Starter</th>
                  <th className="px-4 py-3 text-center text-sm bg-conve-red/5 font-bold">Proactive Health</th>
                  <th className="px-4 py-3 text-center text-sm">Concierge Elite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="px-4 py-3 font-medium text-sm">Per Visit Cost</td>
                  <td className="px-4 py-3 text-center text-sm">$150</td>
                  <td className="px-4 py-3 text-center text-sm text-green-600 font-bold">From $112</td>
                  <td className="px-4 py-3 text-center text-sm text-green-600 font-bold bg-conve-red/5">$125</td>
                  <td className="px-4 py-3 text-center text-sm text-green-600 font-bold">~$83*</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-sm">Visits Included</td>
                  <td className="px-4 py-3 text-center text-sm">Pay-per-visit</td>
                  <td className="px-4 py-3 text-center text-sm">4/year</td>
                  <td className="px-4 py-3 text-center text-sm bg-conve-red/5">12/year</td>
                  <td className="px-4 py-3 text-center text-sm font-bold">Unlimited</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-sm">Scheduling Days</td>
                  <td className="px-4 py-3 text-center text-sm">Mon-Fri</td>
                  <td className="px-4 py-3 text-center text-sm text-green-600">Mon-Sun</td>
                  <td className="px-4 py-3 text-center text-sm text-green-600 bg-conve-red/5">Mon-Sun</td>
                  <td className="px-4 py-3 text-center text-sm text-green-600">Mon-Sun</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-sm">Hours</td>
                  <td className="px-4 py-3 text-center text-sm">8:30 AM - 1:30 PM</td>
                  <td className="px-4 py-3 text-center text-sm text-green-600">6:00 AM - 1:30 PM</td>
                  <td className="px-4 py-3 text-center text-sm text-green-600 bg-conve-red/5">6:00 AM - 1:30 PM</td>
                  <td className="px-4 py-3 text-center text-sm text-green-600">6:00 AM - 1:30 PM</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-sm">Same-Day Booking</td>
                  <td className="px-4 py-3 text-center text-sm">❌</td>
                  <td className="px-4 py-3 text-center text-sm">❌</td>
                  <td className="px-4 py-3 text-center text-sm bg-conve-red/5">✅</td>
                  <td className="px-4 py-3 text-center text-sm">✅</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-sm">Credit Rollover</td>
                  <td className="px-4 py-3 text-center text-sm">❌</td>
                  <td className="px-4 py-3 text-center text-sm">❌</td>
                  <td className="px-4 py-3 text-center text-sm bg-conve-red/5">✅ 3 Months</td>
                  <td className="px-4 py-3 text-center text-sm">N/A (Unlimited)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-sm">Dedicated Phlebotomist</td>
                  <td className="px-4 py-3 text-center text-sm">❌</td>
                  <td className="px-4 py-3 text-center text-sm">❌</td>
                  <td className="px-4 py-3 text-center text-sm bg-conve-red/5">❌</td>
                  <td className="px-4 py-3 text-center text-sm">✅</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-sm">NDA Available</td>
                  <td className="px-4 py-3 text-center text-sm">❌</td>
                  <td className="px-4 py-3 text-center text-sm">❌</td>
                  <td className="px-4 py-3 text-center text-sm bg-conve-red/5">❌</td>
                  <td className="px-4 py-3 text-center text-sm">✅</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-gray-400 text-center mt-2">*Based on ~18 visits/year average usage for unlimited tier</p>
          </div>
        </div>

        {/* Perfect For Section */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-center mb-8">🎯 Perfect For:</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {perfectFor.map((item, index) => (
              <div key={index} className="flex items-center gap-3 bg-white p-4 rounded-lg shadow-sm">
                <Check className="h-5 w-5 text-conve-red flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Why Choose ConveLabs */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-center mb-8">💪 Why Choose ConveLabs?</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {whyChoose.map((item, index) => (
              <div key={index} className="flex items-center gap-3 bg-white p-4 rounded-lg shadow-sm">
                <Shield className="h-5 w-5 text-conve-red flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Important Dates */}
        <div className="mb-16">
          <Card className="max-w-2xl mx-auto text-center">
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2">
                <Clock className="h-6 w-6" />
                📅 Important Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p><strong>Service Launch:</strong> August 1st, 2025</p>
              <p><strong>Early Bird Enrollment:</strong> Available now</p>
            </CardContent>
          </Card>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <h3 className="text-2xl font-bold mb-4">Ready to revolutionize your healthcare experience?</h3>
          <Button 
            onClick={handleRedirectToMembership}
            className="bg-conve-red hover:bg-conve-red/90 text-white py-6 px-12 text-lg mb-4"
            size="lg"
          >
            Join ConveLabs Membership Today! <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <p className="text-sm text-gray-600">
            Service launching August 1st, 2025. Early Bird Enrollment available now with founding member benefits.
          </p>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
