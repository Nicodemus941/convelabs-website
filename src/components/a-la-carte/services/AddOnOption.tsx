
import React from "react";
import { FormControl, FormDescription, FormItem, FormLabel } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { bookingFormSchema } from "@/types/appointmentTypes";

interface AddOnOptionProps {
  form: UseFormReturn<z.infer<typeof bookingFormSchema>>;
  name: "serviceDetails.sameDay" | "serviceDetails.weekend";
  label: string;
  description: string;
  price: number;
}

const AddOnOption: React.FC<AddOnOptionProps> = ({
  form,
  name,
  label,
  description,
  price,
}) => {
  return (
    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
      <FormControl>
        <Checkbox
          checked={form.watch(name) as boolean}
          onCheckedChange={(checked) => {
            form.setValue(name, !!checked, { shouldDirty: true });
          }}
        />
      </FormControl>
      <div className="flex flex-1 justify-between">
        <div className="space-y-1 leading-none">
          <FormLabel>{label}</FormLabel>
          <FormDescription>
            {description}
          </FormDescription>
        </div>
        <span className="font-medium">+${price}</span>
      </div>
    </FormItem>
  );
};

export default AddOnOption;
