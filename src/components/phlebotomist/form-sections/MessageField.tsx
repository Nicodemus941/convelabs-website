
import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { PhlebotomistSignupFormValues } from '../utils/formUtils';

interface MessageFieldProps {
  form: UseFormReturn<PhlebotomistSignupFormValues>;
}

const MessageField: React.FC<MessageFieldProps> = ({ form }) => {
  return (
    <FormField
      control={form.control}
      name="message"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Message (Optional)</FormLabel>
          <FormControl>
            <Textarea 
              placeholder="Tell us about your specific needs or any questions you have" 
              className="min-h-[120px]" 
              {...field} 
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default MessageField;
