
import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EmailTemplate {
  id: string;
  name: string;
  subject_template: string;
  description: string | null;
}

interface EmailTemplateSelectorProps {
  form: UseFormReturn<any>;
  onTemplateChange: (templateId: string) => void;
}

const EmailTemplateSelector: React.FC<EmailTemplateSelectorProps> = ({ form, onTemplateChange }) => {
  const { toast } = useToast();

  // Fetch email templates
  const { data: templates, isLoading: templatesLoading, refetch } = useQuery({
    queryKey: ['emailTemplates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('id, name, subject_template, description')
        .eq('name', 'marketing-campaign');
      
      if (error) throw error;
      return data as EmailTemplate[];
    }
  });

  // Setup default template if none exists
  const [settingUpTemplate, setSettingUpTemplate] = React.useState(false);

  const setupDefaultTemplate = async () => {
    setSettingUpTemplate(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-marketing-template');
      
      if (error) {
        throw error;
      }
      
      // Refetch templates after creation
      await refetch();
      
      toast({
        title: "Template created",
        description: "Marketing campaign template has been created successfully.",
      });

      // Select the template if available after refetch
      if (data?.template?.id) {
        form.setValue('templateId', data.template.id);
        onTemplateChange(data.template.id);
      }
    } catch (err) {
      console.error('Error setting up template:', err);
      toast({
        title: "Template creation failed",
        description: "Failed to create marketing template. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSettingUpTemplate(false);
    }
  };

  // When templates load, select the first one if available
  useEffect(() => {
    if (templates && templates.length > 0 && !form.getValues('templateId')) {
      form.setValue('templateId', templates[0].id);
      onTemplateChange(templates[0].id);
    }
  }, [templates, form, onTemplateChange]);

  return (
    <FormField
      control={form.control}
      name="templateId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Email Template</FormLabel>
          {templates && templates.length > 0 ? (
            <Select 
              disabled={templatesLoading} 
              onValueChange={(value) => {
                field.onChange(value);
                onTemplateChange(value);
              }}
              value={field.value}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {templates?.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">No marketing templates found</p>
              <Button 
                type="button" 
                onClick={setupDefaultTemplate} 
                disabled={settingUpTemplate}
                variant="outline"
                size="sm"
              >
                {settingUpTemplate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Default Template
              </Button>
            </div>
          )}
          <FormDescription>
            {templates?.find(template => template.id === field.value)?.description || "Choose a template for your campaign"}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default EmailTemplateSelector;

