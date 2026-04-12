
import React from "react";
import { 
  FormField, 
  FormItem, 
  FormLabel, 
  FormControl, 
  FormDescription, 
  FormMessage 
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { bookingFormSchema } from "@/types/appointmentTypes";

type ServiceSelectionStepProps = {
  form: UseFormReturn<z.infer<typeof bookingFormSchema>>;
  onNext: () => void;
  onBack: () => void;
};

// Services
const services = [
  { id: "basic", name: "Basic Blood Panel", credits: 1, description: "CBC, Basic Metabolic Panel" },
  { id: "comprehensive", name: "Comprehensive Panel", credits: 2, description: "CBC, Comprehensive Metabolic Panel, Lipid Panel" },
  { id: "hormone", name: "Hormone Panel", credits: 3, description: "Testosterone, Estrogen, Thyroid" },
  { id: "vitamin", name: "Vitamin Panel", credits: 2, description: "Vitamin D, B12, Folate" },
  { id: "custom", name: "Custom Panel", credits: "Varies", description: "Customized to your needs" },
];

const ServiceSelectionStep: React.FC<ServiceSelectionStepProps> = ({ form, onNext, onBack }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Services</CardTitle>
        <CardDescription>Choose the lab tests you need</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <FormField
          control={form.control}
          name="serviceDetails.selectedService"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Service Type</FormLabel>
              <div className="space-y-4">
                <RadioGroup 
                  value={field.value} 
                  onValueChange={field.onChange}
                  className="grid grid-cols-1 gap-4"
                >
                  {services.map((service) => (
                    <div key={service.id} className="flex items-center space-x-2 border rounded-md p-4">
                      <RadioGroupItem value={service.id} id={service.id} />
                      <div className="grid gap-1.5 flex-1">
                        <div className="flex justify-between">
                          <label 
                            htmlFor={service.id} 
                            className="text-base font-semibold cursor-pointer"
                          >
                            {service.name}
                          </label>
                          <span className="text-sm font-medium">
                            {typeof service.credits === "number" 
                              ? `${service.credits} Credit${service.credits !== 1 ? 's' : ''}` 
                              : service.credits
                            }
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {service.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <FormDescription>
                Credits will be deducted from your membership plan
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="serviceDetails.fasting"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Fasting Required</FormLabel>
                <FormDescription>
                  Check if this test requires fasting (no food or drink except water for 8-12 hours)
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="serviceDetails.additionalNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Special Instructions (Optional)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Any special instructions for this lab test..."
                  className="resize-none"
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button type="button" onClick={onNext}>
            Continue <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ServiceSelectionStep;
