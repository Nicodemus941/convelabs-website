
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, Heart, Activity, Users, Stethoscope, Shield, Crown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FunnelData } from "./SalesFunnel";

interface FunnelStep3HealthAssessmentProps {
  data: FunnelData;
  updateData: (newData: Partial<FunnelData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

const FunnelStep3HealthAssessment = ({ data, updateData, onNext, onPrev }: FunnelStep3HealthAssessmentProps) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const labFrequencyOptions = [
    { value: "never", label: "Never / Very Rarely", description: "I avoid lab work when possible" },
    { value: "annual", label: "Once a Year", description: "Annual physical or check-up" },
    { value: "biannual", label: "2-3 Times a Year", description: "Regular monitoring" },
    { value: "quarterly", label: "Every 3 Months", description: "Frequent health tracking" },
    { value: "monthly", label: "Monthly or More", description: "Chronic condition management" }
  ];

  const healthGoalOptions = [
    { id: "preventive", label: "Preventive Care", icon: <Shield className="h-4 w-4 sm:h-5 sm:w-5" />, description: "Stay ahead of health issues" },
    { id: "chronic", label: "Chronic Condition Management", icon: <Activity className="h-4 w-4 sm:h-5 sm:w-5" />, description: "Monitor ongoing conditions" },
    { id: "executive", label: "Executive Health", icon: <Crown className="h-4 w-4 sm:h-5 sm:w-5" />, description: "Comprehensive health optimization" },
    { id: "family", label: "Family Wellness", icon: <Users className="h-4 w-4 sm:h-5 sm:w-5" />, description: "Keep the whole family healthy" },
    { id: "fitness", label: "Fitness & Performance", icon: <Heart className="h-4 w-4 sm:h-5 sm:w-5" />, description: "Optimize athletic performance" },
    { id: "aging", label: "Healthy Aging", icon: <Stethoscope className="h-4 w-4 sm:h-5 sm:w-5" />, description: "Age gracefully with monitoring" }
  ];

  const serviceLocationOptions = [
    { value: "home", label: "At Home", description: "Comfort and convenience of your home" },
    { value: "office", label: "At Office", description: "Professional setting during work hours" },
    { value: "both", label: "Both Options", description: "Flexibility based on schedule" }
  ];

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!data.labFrequency) {
      newErrors.labFrequency = "Please select how often you get lab work";
    }

    if (data.healthGoals.length === 0) {
      newErrors.healthGoals = "Please select at least one health goal";
    }

    if (!data.serviceLocation) {
      newErrors.serviceLocation = "Please select your preferred service location";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateForm()) {
      onNext();
    }
  };

  const handleHealthGoalChange = (goalId: string, checked: boolean) => {
    const currentGoals = data.healthGoals || [];
    if (checked) {
      updateData({ healthGoals: [...currentGoals, goalId] });
    } else {
      updateData({ healthGoals: currentGoals.filter(id => id !== goalId) });
    }
    // Clear error when user makes selection
    if (errors.healthGoals) {
      setErrors(prev => ({ ...prev, healthGoals: "" }));
    }
  };

  return (
    <section className="min-h-screen flex items-center justify-center py-12 px-4 pt-24 sm:pt-32">
      <div className="container mx-auto">
        <motion.div 
          className="max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* Header */}
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-white/80 backdrop-blur-sm rounded-full border border-gray-200/60 text-xs sm:text-sm font-semibold mb-6 sm:mb-8 shadow-luxury">
              <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-conve-red" />
              Health Assessment
            </div>
            
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair font-bold mb-4 sm:mb-6 luxury-heading px-4">
              Tell Us About Your Health
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-600 px-4">
              Help us understand your current health needs and goals so we can recommend the perfect plan.
            </p>
          </div>

          {/* Form */}
          <motion.div 
            className="luxury-card p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {/* Lab Frequency */}
            <div className="space-y-4">
              <Label className="text-base sm:text-lg font-semibold text-gray-800">
                How often do you currently get lab work done? *
              </Label>
              <RadioGroup 
                value={data.labFrequency} 
                onValueChange={(value) => {
                  updateData({ labFrequency: value });
                  if (errors.labFrequency) {
                    setErrors(prev => ({ ...prev, labFrequency: "" }));
                  }
                }}
                className="space-y-3"
              >
                {labFrequencyOptions.map((option) => (
                  <div key={option.value}>
                    <Label htmlFor={option.value} className="flex items-center space-x-3 p-3 sm:p-4 rounded-xl border border-gray-200 hover:border-conve-red/50 hover:bg-conve-red/5 cursor-pointer transition-all min-h-[56px] touch-manipulation">
                      <RadioGroupItem value={option.value} id={option.value} className="text-conve-red flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800 text-sm sm:text-base">{option.label}</div>
                        <div className="text-xs sm:text-sm text-gray-600 leading-relaxed">{option.description}</div>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {errors.labFrequency && (
                <p className="text-sm text-red-600 font-medium">{errors.labFrequency}</p>
              )}
            </div>

            {/* Health Goals - Single column on mobile */}
            <div className="space-y-4">
              <Label className="text-base sm:text-lg font-semibold text-gray-800">
                What are your primary health goals? (Select all that apply) *
              </Label>
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                {healthGoalOptions.map((goal) => (
                  <Card key={goal.id} className="p-3 sm:p-4 hover:shadow-luxury transition-all hover:border-conve-red/50">
                    <Label htmlFor={goal.id} className="flex items-center space-x-3 cursor-pointer min-h-[48px] touch-manipulation">
                      <Checkbox 
                        id={goal.id}
                        checked={data.healthGoals?.includes(goal.id) || false}
                        onCheckedChange={(checked) => handleHealthGoalChange(goal.id, checked as boolean)}
                        className="text-conve-red flex-shrink-0"
                      />
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-conve-red/10 rounded-lg flex items-center justify-center text-conve-red flex-shrink-0">
                          {goal.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-800 text-sm sm:text-base">{goal.label}</div>
                          <div className="text-xs sm:text-sm text-gray-600 leading-relaxed">{goal.description}</div>
                        </div>
                      </div>
                    </Label>
                  </Card>
                ))}
              </div>
              {errors.healthGoals && (
                <p className="text-sm text-red-600 font-medium">{errors.healthGoals}</p>
              )}
            </div>

            {/* Service Location */}
            <div className="space-y-4">
              <Label className="text-base sm:text-lg font-semibold text-gray-800">
                Where would you prefer to receive services? *
              </Label>
              <RadioGroup 
                value={data.serviceLocation} 
                onValueChange={(value) => {
                  updateData({ serviceLocation: value });
                  if (errors.serviceLocation) {
                    setErrors(prev => ({ ...prev, serviceLocation: "" }));
                  }
                }}
                className="grid gap-3 sm:gap-4 sm:grid-cols-3"
              >
                {serviceLocationOptions.map((option) => (
                  <div key={option.value}>
                    <Label htmlFor={option.value} className="flex flex-col items-center p-4 sm:p-6 rounded-xl border border-gray-200 hover:border-conve-red/50 hover:bg-conve-red/5 cursor-pointer transition-all text-center min-h-[80px] touch-manipulation">
                      <RadioGroupItem value={option.value} id={option.value} className="mb-2 sm:mb-3 text-conve-red" />
                      <div className="font-semibold text-gray-800 mb-1 sm:mb-2 text-sm sm:text-base">{option.label}</div>
                      <div className="text-xs sm:text-sm text-gray-600 leading-relaxed">{option.description}</div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {errors.serviceLocation && (
                <p className="text-sm text-red-600 font-medium">{errors.serviceLocation}</p>
              )}
            </div>

            {/* Navigation buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4 sm:pt-6">
              <Button 
                onClick={onPrev}
                variant="outline"
                className="luxury-button-outline flex-1 min-h-[48px] touch-manipulation"
              >
                <ArrowLeft className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                Back
              </Button>
              
              <Button 
                onClick={handleNext}
                className="luxury-button flex-1 min-h-[48px] touch-manipulation"
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default FunnelStep3HealthAssessment;
