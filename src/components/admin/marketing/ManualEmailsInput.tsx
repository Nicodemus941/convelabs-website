
import React from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { UseFormReturn } from 'react-hook-form';

interface ManualEmailsInputProps {
  form: UseFormReturn<any>;
}

const ManualEmailsInput: React.FC<ManualEmailsInputProps> = ({ form }) => {
  // Enhanced email validation
  const validateEmails = (value: string) => {
    if (!value) return true;
    
    const emails = value.split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0);
    
    if (emails.length === 0) {
      return "Please enter at least one email address";
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email));
    
    if (invalidEmails.length > 0) {
      return `Invalid emails: ${invalidEmails.join(', ')}`;
    }
    
    return true;
  };

  return (
    <FormField
      control={form.control}
      name="manualEmails"
      rules={{ 
        validate: validateEmails
      }}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Email Addresses</FormLabel>
          <FormControl>
            <Textarea 
              {...field} 
              rows={5} 
              placeholder="Enter email addresses separated by commas"
              className="font-mono text-sm"
            />
          </FormControl>
          <FormDescription>
            Enter one or more email addresses separated by commas (e.g., user@example.com, another@example.com)
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default ManualEmailsInput;
