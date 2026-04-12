
import React from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UseFormReturn } from 'react-hook-form';

interface EmailContentFieldsProps {
  form: UseFormReturn<any>;
}

const EmailContentFields: React.FC<EmailContentFieldsProps> = ({ form }) => {
  return (
    <>
      <FormField
        control={form.control}
        name="subject"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email Subject</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormDescription>
              This will be the subject line of your email
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      
      <FormField
        control={form.control}
        name="customMessage"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Custom Message</FormLabel>
            <FormControl>
              <Textarea 
                {...field} 
                rows={5} 
                placeholder="Enter your custom message to include in the email template" 
              />
            </FormControl>
            <FormDescription>
              This message will be included in the email template
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
};

export default EmailContentFields;
