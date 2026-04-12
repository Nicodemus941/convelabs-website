import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, Clock, Users, Calendar, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { FunnelData } from "./SalesFunnel";

interface FunnelStep4PreferencesProps {
  data: FunnelData;
  updateData: (newData: Partial<FunnelData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

const FunnelStep4Preferences = ({ data, updateData, onNext, onPrev }: FunnelStep4PreferencesProps) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const timePreferenceOptions = [
    { id: "early-morning", label: "Early Morning", description: "6:00 AM - 9:00 AM", icon: "🌅" },
    { id: "morning", label: "Morning", description: "9:00 AM - 12:00 PM", icon: "☀️" },
    { id: "afternoon", label: "Afternoon", description: "12:00 PM - 5:00 PM", icon: "🌤️" },
    { id: "evening", label: "Evening", description: "5:00 PM - 8:00 PM", icon: "🌆" },
    { id: "weekend", label: "Weekends", description: "Saturday & Sunday", icon: "📅" }
  ];

  const specialRequirementOptions = [
    { id: "therapeutic", label: "Therapeutic Phlebotomy", description: "Specialized blood removal procedures" },
    { id: "pediatric", label: "Pediatric Experience", description: "Experienced with children" },
    { id: "mobility", label: "Mobility Assistance", description: "Need help with positioning or movement" },
    { id: "anxiety", label: "Needle Anxiety Support", description: "Extra care for needle-related anxiety" },
    { id: "chronic", label: "Chronic Condition Management", description: "Ongoing medical condition monitoring" },
    { id: "executive", label: "Executive Scheduling", description: "Flexible, priority scheduling" }
  ];

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!data.householdSize || data.householdSize < 1) {
      newErrors.householdSize = "Please specify household size";
    }

    if (data.preferredTimes.length === 0) {
      newErrors.preferredTimes = "Please select at least one preferred time";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateForm()) {
      onNext();
    }
  };

  const handleTimePreferenceChange = (timeId: string, checked: boolean) => {
    const currentTimes = data.preferredTimes || [];
    if (checked) {
      updateData({ preferredTimes: [...currentTimes, timeId] });
    } else {
      updateData({ preferredTimes: currentTimes.filter(id => id !== timeId) });
    }
    // Clear error when user makes selection
    if (errors.preferredTimes) {
      setErrors(prev => ({ ...prev, preferredTimes: "" }));
    }
  };

  const handleSpecialRequirementChange = (reqId: string, checked: boolean) => {
    const currentReqs = data.specialRequirements || [];
    if (checked) {
      updateData({ specialRequirements: [...currentReqs, reqId] });
    } else {
      updateData({ specialRequirements: currentReqs.filter(id => id !== reqId) });
    }
  };

  const handleHouseholdSizeChange = (value: number[]) => {
    updateData({ householdSize: value[0] });
    // Clear error when user makes selection
    if (errors.householdSize) {
      setErrors(prev => ({ ...prev, householdSize: "" }));
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
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-conve-red" />
              Your Preferences
            </div>
            
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair font-bold mb-4 sm:mb-6 luxury-heading px-4">
              Customize Your Experience
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-600 px-4">
              Let us know your preferences so we can tailor our services to your lifestyle.
            </p>
          </div>

          {/* Form */}
          <motion.div 
            className="luxury-card p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {/* Household Size */}
            <div className="space-y-4 sm:space-y-6">
              <Label className="text-base sm:text-lg font-semibold text-gray-800">
                How many people in your household need services? *
              </Label>
              
              <div className="bg-gray-50/80 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-gray-100/60">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-gray-600">Household Size</span>
                  <span className="text-xl sm:text-2xl font-bold text-conve-red">{data.householdSize || 1}</span>
                </div>
                
                <Slider
                  value={[data.householdSize || 1]}
                  onValueChange={handleHouseholdSizeChange}
                  max={8}
                  min={1}
                  step={1}
                  className="w-full"
                />
                
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>1 person</span>
                  <span>8+ people</span>
                </div>
              </div>
              
              {errors.householdSize && (
                <p className="text-sm text-red-600 font-medium">{errors.householdSize}</p>
              )}
            </div>

            {/* Preferred Times - Single column on mobile */}
            <div className="space-y-4">
              <Label className="text-base sm:text-lg font-semibold text-gray-800">
                What are your preferred appointment times? (Select all that apply) *
              </Label>
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                {timePreferenceOptions.map((time) => (
                  <Card key={time.id} className="p-3 sm:p-4 hover:shadow-luxury transition-all hover:border-conve-red/50">
                    <Label htmlFor={time.id} className="flex items-center space-x-3 cursor-pointer min-h-[48px] touch-manipulation">
                      <Checkbox 
                        id={time.id}
                        checked={data.preferredTimes?.includes(time.id) || false}
                        onCheckedChange={(checked) => handleTimePreferenceChange(time.id, checked as boolean)}
                        className="text-conve-red flex-shrink-0"
                      />
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <span className="text-xl sm:text-2xl flex-shrink-0">{time.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-800 text-sm sm:text-base">{time.label}</div>
                          <div className="text-xs sm:text-sm text-gray-600 leading-relaxed">{time.description}</div>
                        </div>
                      </div>
                    </Label>
                  </Card>
                ))}
              </div>
              {errors.preferredTimes && (
                <p className="text-sm text-red-600 font-medium">{errors.preferredTimes}</p>
              )}
            </div>

            {/* Special Requirements */}
            <div className="space-y-4">
              <Label className="text-base sm:text-lg font-semibold text-gray-800">
                Any special requirements or needs? (Optional)
              </Label>
              <div className="space-y-3">
                {specialRequirementOptions.map((req) => (
                  <Card key={req.id} className="p-3 sm:p-4 hover:shadow-luxury transition-all hover:border-conve-red/50">
                    <Label htmlFor={req.id} className="flex items-start space-x-3 cursor-pointer min-h-[48px] touch-manipulation">
                      <Checkbox 
                        id={req.id}
                        checked={data.specialRequirements?.includes(req.id) || false}
                        onCheckedChange={(checked) => handleSpecialRequirementChange(req.id, checked as boolean)}
                        className="text-conve-red mt-1 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800 text-sm sm:text-base">{req.label}</div>
                        <div className="text-xs sm:text-sm text-gray-600 leading-relaxed">{req.description}</div>
                      </div>
                    </Label>
                  </Card>
                ))}
              </div>
            </div>

            {/* Information note */}
            <div className="bg-conve-red/5 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-conve-red/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-conve-red mt-1 flex-shrink-0" />
                <div className="text-sm text-gray-700 leading-relaxed">
                  <strong className="text-gray-800">Almost there!</strong> Based on your preferences, we'll recommend 
                  the perfect ConveLabs membership plan that fits your lifestyle and health needs.
                </div>
              </div>
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
                Get My Recommendation
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default FunnelStep4Preferences;
