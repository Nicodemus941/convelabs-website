
import { Card, CardContent } from "@/components/ui/card";

export const PricingFAQ = () => {
  return (
    <div className="mt-16 animate-fade-in">
      <h2 className="text-3xl font-bold mb-8 text-center">Frequently Asked Questions</h2>
      <div className="grid gap-8 md:grid-cols-2 text-left max-w-3xl mx-auto">
        <Card className="transform transition-all duration-300 hover:shadow-md">
          <CardContent className="pt-6">
            <h3 className="font-bold text-lg mb-2">What's included in each visit?</h3>
            <p className="text-muted-foreground">
              Each visit includes a professional blood draw at your preferred location (home, office, or hotel), specimen handling, and delivery to our partner labs. Results are delivered through your secure portal.
            </p>
          </CardContent>
        </Card>
        
        <Card className="transform transition-all duration-300 hover:shadow-md">
          <CardContent className="pt-6">
            <h3 className="font-bold text-lg mb-2">Do unused visits roll over?</h3>
            <p className="text-muted-foreground">
              Proactive Health members get credit rollover for up to 3 months. Health Starter visits are annual and do not roll over. Concierge Elite members have unlimited visits.
            </p>
          </CardContent>
        </Card>
        
        <Card className="transform transition-all duration-300 hover:shadow-md">
          <CardContent className="pt-6">
            <h3 className="font-bold text-lg mb-2">How does the Practice Partner plan work?</h3>
            <p className="text-muted-foreground">
              Concierge physicians pay $100/patient/month for 12 visits per patient per year. Minimum 5 patients required. Includes white-label integration and dedicated account management.
            </p>
          </CardContent>
        </Card>
        
        <Card className="transform transition-all duration-300 hover:shadow-md">
          <CardContent className="pt-6">
            <h3 className="font-bold text-lg mb-2">What are the scheduling hours?</h3>
            <p className="text-muted-foreground">
              Members enjoy 7-day scheduling: Monday-Sunday, 6:00 AM - 1:30 PM (excluding holidays). Non-members are limited to Monday-Friday, 8:30 AM - 1:30 PM.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
