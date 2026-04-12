
import { useState, useEffect } from "react";
import { toast } from "@/components/ui/sonner";
import { createPartnershipCheckout } from "@/services/stripe";
import { useAuth } from "@/contexts/AuthContext";

export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  deliveryTime: string;
  isPopular: boolean;
}

export interface AddOn {
  id: string;
  name: string;
  price: number;
  description: string;
}

export const usePricingSelection = () => {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Check localStorage for saved selections on component mount
  useEffect(() => {
    const savedPlanId = localStorage.getItem('selectedPlanId');
    const savedAddOns = localStorage.getItem('selectedAddOns');
    
    if (savedPlanId) {
      setSelectedPlan(savedPlanId);
    }
    
    if (savedAddOns) {
      try {
        setSelectedAddOns(JSON.parse(savedAddOns));
      } catch (e) {
        console.error("Error parsing saved add-ons", e);
      }
    }
  }, []);

  // Define pricing plans
  const pricingPlans: PricingPlan[] = [
    {
      id: "standard-package",
      name: "Standard Package",
      price: 5000,
      description: "Essential features to get your platform off the ground.",
      features: [
        "Custom Branded Website",
        "Patient Booking System",
        "HIPAA Compliant",
      ],
      deliveryTime: "30 days",
      isPopular: false,
    },
    {
      id: "express-package",
      name: "Premium Package",
      price: 10000,
      description: "Enhanced features for a growing practice.",
      features: [
        "Everything in Standard",
        "Patient Portal",
        "Automated Reminders",
      ],
      deliveryTime: "20 days",
      isPopular: true,
    }
  ];

  // Define add-ons
  const addOns: AddOn[] = [
    {
      id: "domain",
      name: "Custom Domain Setup",
      price: 500,
      description: "We'll handle the domain setup for you.",
    },
    {
      id: "marketing",
      name: "Marketing Package",
      price: 1000,
      description: "Get a head start with our marketing package.",
    },
  ];

  const toggleAddOn = (addOnId: string) => {
    setSelectedAddOns((prev) =>
      prev.includes(addOnId)
        ? prev.filter((id) => id !== addOnId)
        : [...prev, addOnId]
    );
  };

  const calculateTotalPrice = () => {
    const plan = pricingPlans.find(plan => plan.id === selectedPlan);
    const planPrice = plan ? plan.price : 0;
    
    const addOnTotal = selectedAddOns.reduce((acc, addOnId) => {
      const addOn = addOns.find((addOn) => addOn.id === addOnId);
      return addOn ? acc + addOn.price : acc;
    }, 0);

    return planPrice + addOnTotal;
  };

  const handleCheckout = async (planId: string) => {
    if (selectedPlan !== planId) {
      setSelectedPlan(planId);
      return;
    }

    if (!user) {
      toast.error("Please create an account before proceeding to checkout");
      return;
    }

    setIsProcessing(true);
    
    // Find the selected plan
    const plan = pricingPlans.find((p) => p.id === planId);

    if (!plan) {
      toast.error("Please select a valid plan.");
      setIsProcessing(false);
      return;
    }

    // Store the package name in localStorage
    localStorage.setItem('partnershipPackageName', plan.name);

    // Store the package ID in localStorage
    localStorage.setItem('partnershipPackageId', planId);

    const amount = calculateTotalPrice();
    
    // Create metadata with selected add-ons and user information
    const metadata: Record<string, string> = {
      addons: selectedAddOns.join(", "),
      user_id: user.id,
      user_email: user.email || ''
    };

    try {
      // Log attempt
      console.log("Creating partnership checkout for plan:", planId, "with amount:", amount);
      
      // Open checkout session
      const result = await createPartnershipCheckout(planId, amount, metadata);
      console.log("Checkout result:", result);

      if (result.url) {
        // Open Stripe checkout in a new tab
        window.location.href = result.url;
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Error creating checkout:", error);
      toast.error("Failed to create checkout session. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    selectedPlan,
    selectedAddOns,
    isProcessing,
    pricingPlans,
    addOns,
    toggleAddOn,
    calculateTotalPrice,
    handleCheckout
  };
};
