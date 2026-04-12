
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";

export const PricingWhyChoose = () => {
  return (
    <div className="my-16 animate-fade-in">
      <h2 className="text-3xl font-bold mb-6 text-center">Why Choose Our Membership?</h2>
      <div className="grid md:grid-cols-3 gap-8 mt-8">
        <Card className="transform transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
          <CardContent className="pt-6">
            <div className="bg-primary/10 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-2">Convenience First</h3>
            <p className="text-muted-foreground">
              Skip the waiting rooms. Our phlebotomists come to your home or office at a time that works for you.
            </p>
          </CardContent>
        </Card>
        
        <Card className="transform transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
          <CardContent className="pt-6">
            <div className="bg-primary/10 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-2">Predictable Pricing</h3>
            <p className="text-muted-foreground">
              Say goodbye to surprise lab bills. Our membership model gives you transparent pricing for all services.
            </p>
          </CardContent>
        </Card>
        
        <Card className="transform transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
          <CardContent className="pt-6">
            <div className="bg-primary/10 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-2">Quality Care</h3>
            <p className="text-muted-foreground">
              Experienced phlebotomists, accurate results, and secure online access to all your lab reports.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
