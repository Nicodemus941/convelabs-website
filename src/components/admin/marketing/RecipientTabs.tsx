
import React from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, User } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import MemberFilters from './MemberFilters';
import ManualEmailsInput from './ManualEmailsInput';

interface RecipientTabsProps {
  form: UseFormReturn<any>;
}

const RecipientTabs: React.FC<RecipientTabsProps> = ({ form }) => {
  return (
    <FormField
      control={form.control}
      name="recipientMode"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Recipients</FormLabel>
          <FormControl>
            <Tabs 
              value={field.value} 
              onValueChange={field.onChange as (value: string) => void}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="members" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Members
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Manual Emails
                </TabsTrigger>
              </TabsList>
              <TabsContent value="members" className="pt-4">
                <MemberFilters form={form} />
              </TabsContent>
              <TabsContent value="manual" className="pt-4">
                <ManualEmailsInput form={form} />
              </TabsContent>
            </Tabs>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default RecipientTabs;
