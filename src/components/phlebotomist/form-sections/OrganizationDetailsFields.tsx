
import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PhlebotomistSignupFormValues } from '../utils/formUtils';

interface OrganizationDetailsFieldsProps {
  form: UseFormReturn<PhlebotomistSignupFormValues>;
}

const OrganizationDetailsFields: React.FC<OrganizationDetailsFieldsProps> = ({ form }) => {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <FormField
        control={form.control}
        name="organizationName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Organization/Business Name</FormLabel>
            <FormControl>
              <Input placeholder="Your organization name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      
      <FormField
        control={form.control}
        name="contactName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Contact Person</FormLabel>
            <FormControl>
              <Input placeholder="Full name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

export default OrganizationDetailsFields;
