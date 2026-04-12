
import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, Star, Crown, Users, Heart, Zap, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FunnelData } from "./SalesFunnel";
import { withSource, ENROLLMENT_URL } from "@/lib/constants/urls";

interface FunnelStep5RecommendationProps {
  data: FunnelData;
  onPrev: () => void;
}

interface MembershipPlan {
  id: string;
  name: string;
  subtitle: string;
  monthlyPrice?: number;
  annualPrice: number;
  icon: React.ReactNode;
  badge?: string;
  features: string[];
  serviceCount: string;
  perVisitCost: string;
  savings: string;
  idealFor: string;
  popular?: boolean;
  recommended?: boolean;
  annualOnly?: boolean;
  isB2B?: boolean;
  isUnlimited?: boolean;
}

const FunnelStep5Recommendation = ({ data, onPrev }: FunnelStep5RecommendationProps) => {
  
  const membershipPlans: MembershipPlan[] = [
    {
      id: "health_starter",
      name: "Health Starter",
      subtitle: "Annual plan for routine health monitoring",
      annualPrice: 499,
      icon: <Heart className="h-6 w-6" />,
      annualOnly: true,
      serviceCount: "4 lab visits per year",
      perVisitCost: "$125 per visit",
      savings: "Save $25/visit vs $150 non-member rate",
      features: [
        "4 lab visits included per year",
        "$125 effective per visit",
        "At-home or in-office visits",
        "Result tracking included",
        "7-day scheduling: Mon-Sun, 6 AM - 1:30 PM"
      ],
      idealFor: "Individuals needing occasional lab monitoring"
    },
    {
      id: "proactive_health",
      name: "Proactive Health",
      subtitle: "Best for executives and athletes needing regular monitoring",
      monthlyPrice: 149,
      annualPrice: 1499,
      icon: <Users className="h-6 w-6" />,
      badge: "Most Popular",
      popular: true,
      serviceCount: "12 lab visits per year (1/month)",
      perVisitCost: "$125 per visit",
      savings: "Save $301/year vs non-member pricing",
      features: [
        "12 lab visits per year (1/month)",
        "Same-day scheduling available",
        "Health insights dashboard",
        "Credit rollover (up to 3 months)",
        "Priority booking over non-members",
        "7-day scheduling: Mon-Sun, 6 AM - 1:30 PM"
      ],
      idealFor: "Executives, athletes, and anyone needing regular health monitoring"
    },
    {
      id: "concierge_elite",
      name: "Concierge Elite",
      subtitle: "White-glove service for celebrities and high-net-worth clients",
      monthlyPrice: 299,
      annualPrice: 2999,
      icon: <Crown className="h-6 w-6" />,
      isUnlimited: true,
      serviceCount: "Unlimited lab visits",
      perVisitCost: "Unlimited visits included",
      savings: "Best value for frequent testing",
      features: [
        "Unlimited lab visits",
        "Dedicated phlebotomist assigned to you",
        "NDA available upon request",
        "Hotel, office, and home visits",
        "White-glove concierge service",
        "7-day scheduling: Mon-Sun, 6 AM - 1:30 PM"
      ],
      idealFor: "Celebrities, executives, and high-net-worth individuals"
    },
    {
      id: "practice_partner",
      name: "Practice Partner",
      subtitle: "B2B plan for concierge physicians and medical practices",
      monthlyPrice: 100,
      annualPrice: 1200,
      icon: <Shield className="h-6 w-6" />,
      isB2B: true,
      serviceCount: "12 visits per patient/year",
      perVisitCost: "$100/patient/month",
      savings: "Save $50/visit vs non-member rate per patient",
      features: [
        "$100/patient/month (12 visits per patient/year)",
        "Minimum 5 patients, maximum 100",
        "White-label service integration",
        "Dedicated account management",
        "Priority scheduling and routing",
        "7-day scheduling: Mon-Sun, 6 AM - 1:30 PM"
      ],
      idealFor: "Concierge physicians and medical practices"
    }
  ];

  // Enhanced recommendation algorithm
  const getRecommendedPlan = (): string => {
    const { householdSize, labFrequency, healthGoals, specialRequirements } = data;
    
    // B2B — if they indicate physician/practice needs
    if (specialRequirements?.includes("practice") || specialRequirements?.includes("physician")) {
      return "practice_partner";
    }
    
    // Concierge Elite for VIP/celebrity/high-frequency needs
    if (specialRequirements?.includes("nda") || specialRequirements?.includes("vip") || specialRequirements?.includes("celebrity")) {
      return "concierge_elite";
    }
    
    // Proactive Health for regular testing
    if (labFrequency === "monthly" || labFrequency === "quarterly") return "proactive_health";
    if (labFrequency === "biannual") return "proactive_health";
    
    // Health Starter for minimal testing
    if (labFrequency === "annual" || labFrequency === "never") return "health_starter";
    
    // Default to Proactive Health (most popular)
    return "proactive_health";
  };

  const recommendedPlanId = getRecommendedPlan();
  const recommendedPlan = membershipPlans.find(plan => plan.id === recommendedPlanId);
  const otherPlans = membershipPlans.filter(plan => plan.id !== recommendedPlanId);

  const handleEnrollClick = (planId: string) => {
    if (planId === "practice_partner") {
      window.location.href = "/contact";
      return;
    }
    window.location.href = withSource(ENROLLMENT_URL, `funnel_${planId}`);
  };

  const getPersonalizedMessage = (): string => {
    const { healthGoals, labFrequency } = data;
    
    if (recommendedPlanId === "practice_partner") {
      return "Our Practice Partner plan provides seamless white-label phlebotomy for your patients with dedicated account management.";
    }
    
    if (recommendedPlanId === "concierge_elite") {
      return "Our Concierge Elite plan delivers unlimited, white-glove service with a dedicated phlebotomist and complete privacy.";
    }
    
    if (recommendedPlanId === "proactive_health") {
      return "Our Proactive Health plan offers the perfect balance of services and savings for regular health monitoring with priority scheduling.";
    }
    
    return "Our Health Starter plan provides excellent value for annual health monitoring at just $125 per visit.";
  };

  const formatPricing = (plan: MembershipPlan) => {
    if (plan.annualOnly) {
      return {
        primary: `$${plan.annualPrice}/year`,
        secondary: null,
        monthly: `~$${Math.round(plan.annualPrice / 12)}/month`
      };
    }
    
    if (plan.isB2B) {
      return {
        primary: `$${plan.monthlyPrice}/patient/mo`,
        secondary: null,
        monthly: `Min 5 patients ($${(plan.monthlyPrice || 0) * 5}/mo)`
      };
    }
    
    return {
      primary: `$${plan.monthlyPrice}/month`,
      secondary: `or $${plan.annualPrice}/year`,
      monthly: `Save ${Math.round((1 - plan.annualPrice / ((plan.monthlyPrice || 1) * 12)) * 100)}% annually`
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
                      {formatPricing(recommendedPlan).secondary && (
                        <p className="text-sm text-green-600 font-semibold mb-1">
                          {formatPricing(recommendedPlan).secondary}
                        </p>
                      )}
                      <p className="text-sm text-gray-500">
                        {formatPricing(recommendedPlan).monthly} • {recommendedPlan.serviceCount}
                      </p>
                    </div>

                    <div className="mb-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                        <p className="text-sm font-semibold text-green-800">{recommendedPlan.perVisitCost}</p>
                        <p className="text-sm text-green-700">{recommendedPlan.savings}</p>
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
                      {recommendedPlan.isB2B ? "Contact Us" : "Start Your Membership"}
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
                    {formatPricing(plan).secondary && (
                      <p className="text-sm text-green-600 font-semibold">
                        {formatPricing(plan).secondary}
                      </p>
                    )}
                    <p className="text-sm text-gray-500">
                      {formatPricing(plan).monthly}
                    </p>
                  </div>

                  <div className="mb-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                      <p className="text-sm font-semibold text-gray-800">{plan.perVisitCost}</p>
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
                    {plan.isB2B ? "Contact Us" : "Choose This Plan"}
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
