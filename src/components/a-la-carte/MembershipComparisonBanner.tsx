
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ENROLLMENT_URL, withSource } from "@/lib/constants/urls";

interface MembershipComparisonBannerProps {
  className?: string;
}

const MembershipComparisonBanner: React.FC<MembershipComparisonBannerProps> = ({ className }) => {
  return (
    <Card className={cn("border-conve-red/20 bg-conve-red/5", className)}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <h3 className="font-bold text-lg">Upgrade to Membership & Unlock Full Scheduling Access + Savings</h3>
            <p className="text-sm text-gray-600">
              Members enjoy priority scheduling, flexible hours, and save up to 30% on lab services
            </p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-600 mr-2 shrink-0" />
                <span>Unlimited scheduling options</span>
              </li>
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-600 mr-2 shrink-0" />
                <span>Priority booking</span>
              </li>
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-600 mr-2 shrink-0" />
                <span>Insurance billing</span>
              </li>
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-600 mr-2 shrink-0" />
                <span>Discounted lab pricing</span>
              </li>
            </ul>
          </div>
          <div className="flex justify-center md:justify-end">
            <Button 
              className="bg-conve-red hover:bg-conve-red/90"
              onClick={() => window.location.href = withSource(ENROLLMENT_URL, 'comparison_banner')}
            >
              View Membership Plans <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MembershipComparisonBanner;
