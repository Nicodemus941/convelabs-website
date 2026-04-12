
import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles, Calendar } from "lucide-react";
import { FoundingMemberBadge } from "@/components/ui/founding-member-badge";

interface FoundingMemberNoticeProps {
  nextBillingDate?: string | null;
}

const FoundingMemberNotice = ({ nextBillingDate }: FoundingMemberNoticeProps) => {
  const formattedDate = nextBillingDate 
    ? new Date(nextBillingDate).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    : "September 1st, 2025";

  return (
    <Alert className="bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200 mb-6">
      <Sparkles className="h-5 w-5 text-amber-600" />
      <AlertTitle className="flex items-center font-bold text-amber-800">
        <FoundingMemberBadge className="mr-2" />
      </AlertTitle>
      <AlertDescription className="text-amber-800">
        <p className="mb-2">
          Thank you for joining as a Founding Member! Your membership officially begins August 1st.
        </p>
        <div className="flex items-center text-sm">
          <Calendar className="h-4 w-4 mr-1" />
          <span>Next billing date: {formattedDate}</span>
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default FoundingMemberNotice;
