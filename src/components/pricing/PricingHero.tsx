
import { Check } from "lucide-react";

export const PricingHero = () => {
  return (
    <div className="text-center mb-12 animate-fade-in">
      <h1 className="text-4xl md:text-5xl font-bold mb-4 text-primary">Membership That Matters</h1>
      <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
        Convenient lab testing on your schedule, with memberships designed to save you time and money.
      </p>
      <div className="flex flex-wrap justify-center gap-3 max-w-lg mx-auto mb-6">
        <div className="flex items-center bg-muted/50 px-3 py-1 rounded-full">
          <Check className="h-4 w-4 text-primary mr-2" /> Convenient at-home visits
        </div>
        <div className="flex items-center bg-muted/50 px-3 py-1 rounded-full">
          <Check className="h-4 w-4 text-primary mr-2" /> No surprise bills
        </div>
        <div className="flex items-center bg-muted/50 px-3 py-1 rounded-full">
          <Check className="h-4 w-4 text-primary mr-2" /> Fast results
        </div>
      </div>
    </div>
  );
};
