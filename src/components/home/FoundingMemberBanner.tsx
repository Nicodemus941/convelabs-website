
import React from "react";
import { CountdownTimer } from "@/components/ui/countdown-timer";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

const FoundingMemberBanner = () => {
  const navigate = useNavigate();
  // August 1st, 2025 date for campaign end
  const campaignEndDate = new Date(2025, 7, 1); // Month is 0-indexed, so 7 is August
  
  return (
    <div className="bg-gradient-to-r from-conve-gold/90 to-amber-600/90 text-white py-3">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center mb-2 md:mb-0">
            <Sparkles className="h-5 w-5 mr-2" />
            <span className="font-semibold">
              Founding Member Enrollment Now Open — Official Memberships Begin August 1st
            </span>
          </div>
          
          <div className="flex flex-col md:flex-row items-center">
            <div className="mr-0 md:mr-4 mb-2 md:mb-0">
              <span className="mr-2">Limited Time Offer:</span>
              <CountdownTimer targetDate={campaignEndDate} compact={true} />
            </div>
            <Button 
              size="sm" 
              variant="outline"
              className="bg-white text-amber-700 hover:bg-white/90 border-white"
              onClick={() => navigate('/pricing')}
            >
              Join Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FoundingMemberBanner;
