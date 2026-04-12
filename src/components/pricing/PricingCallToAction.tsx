
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookNowButton } from "@/components/ui/book-now-button";
import { MembershipButton } from "@/components/ui/membership-button";

export const PricingCallToAction = () => {
  return (
    <div className="mt-16 text-center pb-8 animate-fade-in">
      <Card className="bg-primary/5 border-primary/10">
        <CardContent className="py-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to Experience Better Healthcare?</h2>
          <p className="text-lg mb-6 max-w-xl mx-auto">
            Join thousands of members who have simplified their lab testing experience with our membership plans.
          </p>
          <div className="flex flex-col md:flex-row gap-4 justify-center mb-4">
            <BookNowButton 
              size="lg" 
              className="font-semibold text-base" 
              showNote={false}
              useQuickBooking={true}
            />
            <MembershipButton
              size="lg"
              className="font-semibold text-base"
              showNote={false}
            >
              Choose Your Plan Today
            </MembershipButton>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 max-w-md mx-auto">
            <p className="text-xs text-green-700">
              💡 <span className="font-medium">Pro Tip:</span> Start with a quick appointment to experience our service, 
              then upgrade to membership for maximum savings on future visits.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
