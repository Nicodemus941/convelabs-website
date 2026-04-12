
import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PhlebotomistSignupFormValues } from '../utils/formUtils';

interface OrganizationTypeFieldsProps {
  form: UseFormReturn<PhlebotomistSignupFormValues>;
}

const OrganizationTypeFields: React.FC<OrganizationTypeFieldsProps> = ({ form }) => {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <FormField
        control={form.control}
        name="organizationType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Organization Type</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select organization type" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="independent">Independent Phlebotomist</SelectItem>
                <SelectItem value="small_practice">Small Practice (2-10 employees)</SelectItem>
                <SelectItem value="medium_practice">Medium Practice (11-50 employees)</SelectItem>
                <SelectItem value="large_organization">Large Organization (50+ employees)</SelectItem>
                <SelectItem value="laboratory">Laboratory</SelectItem>
                <SelectItem value="hospital">Hospital</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      
      <FormField
        control={form.control}
        name="teamSize"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Team Size</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select team size" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="1">Just me</SelectItem>
                <SelectItem value="2-5">2-5 phlebotomists</SelectItem>
                <SelectItem value="6-10">6-10 phlebotomists</SelectItem>
                <SelectItem value="11-25">11-25 phlebotomists</SelectItem>
                <SelectItem value="26-50">26-50 phlebotomists</SelectItem>
                <SelectItem value="50+">50+ phlebotomists</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

export default OrganizationTypeFields;
