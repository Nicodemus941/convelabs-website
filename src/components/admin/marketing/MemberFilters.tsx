
import React from 'react';
import { FormField, FormItem, FormLabel, FormDescription, FormControl } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { UseFormReturn } from 'react-hook-form';

interface MemberFiltersProps {
  form: UseFormReturn<any>;
}

const MemberFilters: React.FC<MemberFiltersProps> = ({ form }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-md font-medium">Member Filters</h3>
      
      <FormField
        control={form.control}
        name="includeFoundingMembers"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
              <FormLabel>Founding Members</FormLabel>
              <FormDescription>
                Include founding members in this campaign
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />
      
      <FormField
        control={form.control}
        name="includeSupernovaMembers"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
              <FormLabel>Supernova Members</FormLabel>
              <FormDescription>
                Include Supernova deal members in this campaign
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />
      
      <FormField
        control={form.control}
        name="onlyActiveMembers"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
              <FormLabel>Only Active Members</FormLabel>
              <FormDescription>
                Only include members with active subscriptions
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );
};

export default MemberFilters;
