
import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Star } from "lucide-react";

const PricingFoundingMemberNote: React.FC = () => {
  return (
    <Alert className="mb-8 border border-conve-gold/20 bg-gradient-to-r from-amber-50 to-yellow-50">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-shrink-0 h-10 w-10 bg-conve-gold/20 rounded-full flex items-center justify-center">
          <Star className="h-6 w-6 text-conve-gold fill-conve-gold" />
        </div>
        <div>
          <AlertTitle className="text-xl font-semibold mb-1">
            Founding Member Opportunity
          </AlertTitle>
          <AlertDescription className="text-base">
            Join now as a founding member to lock in our introductory pricing and receive priority scheduling when we launch.
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
};

export default PricingFoundingMemberNote;
