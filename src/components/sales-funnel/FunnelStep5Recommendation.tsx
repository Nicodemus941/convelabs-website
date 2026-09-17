import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, Star, Crown, Sparkles, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FunnelData } from "./SalesFunnel";
import { withSource } from "@/lib/constants/urls";
import { analytics } from "@/utils/analytics";

interface FunnelStep5RecommendationProps {
  data: FunnelData;
  onPrev: () => void;
}

interface MembershipPlan {
  id: "member" | "vip" | "concierge";
  name: string;
  subtitle: string;
  annualPrice: number;
  icon: React.ReactNode;
  badge?: string;
  features: string[];
  savings: string;
  idealFor: string;
  popular?: boolean;
}

const FunnelStep5Recommendation = ({ data, onPrev }: FunnelStep5RecommendationProps) => {
  const membershipPlans: MembershipPlan[] = [
    {
      id: "member",
      name: "Regular",
      subtitle: "For people who want faster mornings without full concierge spend",
      annualPrice: 9.99,
      icon: <Sparkles className="h-6 w-6" />,
      savings: "Lower visit pricing and waived admin friction after just a few draws",
      features: [
        "Mon-Fri 6am-12pm access",
        "Saturday 6-9am access",
        "$55 family add-on on the same visit",
        "Complimentary results retrieval",
        "Reschedule fee waived"
      ],
      idealFor: "Best for occasional draws and simpler scheduling needs"
    },
    {
      id: "vip",
      name: "VIP",
      subtitle: "Priority scheduling plus better family economics",
      annualPrice: 19.99,
      icon: <Star className="h-6 w-6" />,
      badge: "Most Popular",
      popular: true,
      savings: "Best trade-off for repeat patients who need better access",
      features: [
        "Mon-Fri 6am-2pm access",
        "Saturday 6am-11am access",
        "30-day booking window",
        "$45 family add-on on the same visit",
        "Referral credit and waived reschedules"
      ],
      idealFor: "Best for regular monitoring, couples, and busy professionals"
    },
    {
      id: "concierge",
      name: "Concierge",
      subtitle: "Maximum flexibility with true white-glove treatment",
      annualPrice: 49.99,
      icon: <Crown className="h-6 w-6" />,
      savings: "Highest convenience for high-frequency households and premium patients",
      features: [
        "Anytime 6am-8pm plus Sunday by request",
        "Guaranteed same-day booking",
        "Free family add-on for 2 people",
        "NDA available upon request",
        "Dedicated phlebotomist",
        "Priority travel support across ConveLabs cities"
      ],
      idealFor: "Best for executives, families, and patients who want zero scheduling friction"
    }
  ];

  const getRecommendedPlan = (): MembershipPlan["id"] => {
    const { householdSize, labFrequency, healthGoals, preferredTimes, specialRequirements } = data;
    const wantsPremiumAccess =
      preferredTimes.includes("weekend") ||
      preferredTimes.includes("evening") ||
      specialRequirements.includes("executive");
    const hasFamilyNeed = householdSize > 1 || healthGoals.includes("family");
    const needsFrequentDraws = labFrequency === "monthly" || labFrequency === "quarterly";

    if (needsFrequentDraws && (wantsPremiumAccess || hasFamilyNeed)) {
      return "concierge";
    }
    if (needsFrequentDraws || labFrequency === "biannual" || wantsPremiumAccess || hasFamilyNeed) {
      return "vip";
    }
    return "member";
  };

  const recommendedPlanId = getRecommendedPlan();
  const recommendedPlan = membershipPlans.find(plan => plan.id === recommendedPlanId);
  const otherPlans = membershipPlans.filter(plan => plan.id !== recommendedPlanId);

  const handleEnrollClick = (planId: MembershipPlan["id"]) => {
    analytics.trackFunnelStage("try_funnel_plan_selected", 5, {
      recommended_plan: recommendedPlanId,
      selected_plan: planId,
    });

    window.location.href = withSource(`/pricing?tier=${planId}&checkout=1`, `try_funnel_${planId}`);
  };

  const getPersonalizedMessage = (): string => {
    if (recommendedPlanId === "concierge") {
      return "You look like a strong fit for Concierge because your answers point to premium scheduling flexibility and repeat use.";
    }

    if (recommendedPlanId === "vip") {
      return "VIP fits best when you need repeat draws, broader booking windows, or better family economics without going full concierge.";
    }

    return "Regular gives you a lower-commitment way to unlock better booking windows and member pricing without overbuying.";
  };

  const formatPricing = (plan: MembershipPlan) => {
    return {
      primary: `$${plan.annualPrice.toFixed(2)}/year`,
      secondary: null,
      monthly: `~$${(plan.annualPrice / 12).toFixed(2)}/month billed annually`
    };
  };

  return (
    <section className="min-h-screen flex items-center justify-center py-20 pt-32">
      <div className="container mx-auto px-4">
        <motion.div 
          className="max-w-6xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/80 backdrop-blur-sm rounded-full border border-gray-200/60 text-sm font-semibold mb-8 shadow-luxury">
              <Star className="h-5 w-5 text-conve-red" />
              Your Personalized Recommendation
            </div>
            
            <h2 className="text-4xl md:text-5xl font-playfair font-bold mb-6 luxury-heading">
              Perfect Plan Found!
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              {getPersonalizedMessage()}
            </p>
          </div>

          {/* Recommended Plan - Featured */}
          {recommendedPlan && (
            <motion.div
              className="mb-12"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="luxury-card p-8 border-2 border-conve-red relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-conve-red text-white px-6 py-2 rounded-bl-xl font-semibold">
                  Recommended for You
                </div>
                
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-conve-red/10 rounded-xl flex items-center justify-center text-conve-red">
                        {recommendedPlan.icon}
                      </div>
                      <div>
                        <h3 className="text-2xl font-playfair font-bold text-gray-900">
                          {recommendedPlan.name}
                        </h3>
                        <p className="text-gray-600">{recommendedPlan.subtitle}</p>
                      </div>
                    </div>
                    
                    <div className="mb-6">
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-4xl font-bold text-conve-red">
                          {formatPricing(recommendedPlan).primary}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {formatPricing(recommendedPlan).monthly}
                      </p>
                    </div>

                    <div className="mb-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                        <p className="text-sm text-green-800 font-semibold">{recommendedPlan.savings}</p>
                      </div>
                    </div>

                    <div className="space-y-3 mb-6">
                      {recommendedPlan.features.slice(0, 4).map((feature, index) => (
                        <div key={index} className="flex items-center gap-3">
                          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                          <span className="text-gray-700">{feature}</span>
                        </div>
                      ))}
                    </div>

                    <p className="text-sm text-gray-600 mb-6 italic">
                      {recommendedPlan.idealFor}
                    </p>
                  </div>

                  <div className="text-center">
                    <Button 
                      onClick={() => handleEnrollClick(recommendedPlan.id)}
                      className="luxury-button text-xl py-6 px-12 font-semibold tracking-wide mb-4 w-full"
                      size="lg"
                    >
                      Continue With {recommendedPlan.name}
                      <Zap className="ml-3 h-6 w-6" />
                    </Button>
                    
                    <p className="text-sm text-gray-500 font-medium">
                      ✓ 99% first-stick success • ✓ 0% lost samples • ✓ On-time guarantee
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Other Plans */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <h3 className="text-2xl font-playfair font-bold text-center mb-8 text-gray-800">
              Or Choose Another Plan
            </h3>
            
            <div className="grid md:grid-cols-3 gap-6">
              {otherPlans.map((plan) => (
                <Card key={plan.id} className="p-6 hover:shadow-luxury transition-all relative">
                  {plan.popular && (
                    <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-conve-red text-white">
                      {plan.badge}
                    </Badge>
                  )}
                  
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-conve-red/10 rounded-xl flex items-center justify-center text-conve-red mx-auto mb-3">
                      {plan.icon}
                    </div>
                    <h4 className="text-xl font-playfair font-bold mb-2">{plan.name}</h4>
                    <p className="text-gray-600 text-sm">{plan.subtitle}</p>
                  </div>

                  <div className="text-center mb-4">
                    <div className="text-2xl font-bold text-conve-red mb-1">
                      {formatPricing(plan).primary}
                    </div>
                    <p className="text-sm text-gray-500">
                      {formatPricing(plan).monthly}
                    </p>
                  </div>

                  <div className="mb-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-600">{plan.savings}</p>
                    </div>
                  </div>

                  <div className="space-y-2 mb-6">
                    {plan.features.slice(0, 3).map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span className="text-gray-600">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Button 
                    onClick={() => handleEnrollClick(plan.id)}
                    variant="outline" 
                    className="w-full luxury-button-outline"
                  >
                    Choose {plan.name}
                  </Button>
                </Card>
              ))}
            </div>
          </motion.div>

          {/* Back Button */}
          <motion.div 
            className="text-center mt-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <Button 
              onClick={onPrev}
              variant="ghost"
              className="text-gray-600 hover:text-gray-800"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back to Preferences
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default FunnelStep5Recommendation;
