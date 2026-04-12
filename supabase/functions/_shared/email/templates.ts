
import Handlebars from 'npm:handlebars@4.7.8';
import { createSupabaseAdmin } from './client.ts';

// Helper function to render templates with Handlebars
export const renderTemplate = (template: string, data: Record<string, any>): string => {
  try {
    // Register common helpers
    registerHandlebarsHelpers();
    
    // Compile and render the template
    const compiledTemplate = Handlebars.compile(template);
    return compiledTemplate(data);
  } catch (error) {
    console.error('Error rendering template:', error);
    throw error;
  }
};

// Register handlebars helpers for template rendering
const registerHandlebarsHelpers = () => {
  Handlebars.registerHelper('formatDate', function(date: Date | string, format: string = 'MMM D, YYYY') {
    if (!date) return '';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Simple formatter that doesn't require additional dependencies
    const month = dateObj.toLocaleString('default', { month: 'short' });
    const day = dateObj.getDate();
    const year = dateObj.getFullYear();
    
    return `${month} ${day}, ${year}`;
  });
  
  Handlebars.registerHelper('formatCurrency', function(amount: number) {
    if (typeof amount !== 'number') return '';
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD' 
    }).format(amount / 100);
  });
  
  Handlebars.registerHelper('if_eq', function(a: any, b: any, opts: any) {
    if (a === b) {
      return opts.fn(this);
    } else {
      return opts.inverse(this);
    }
  });
};

// Get email template from database and render with provided data
export const getRenderedTemplate = async (templateName: string, data: Record<string, any> = {}): Promise<{
  subject: string,
  html: string,
  text?: string
}> => {
  const supabase = createSupabaseAdmin();
  
  // Fetch template from database
  const { data: template, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('name', templateName)
    .single();
    
  if (error || !template) {
    console.error('Error fetching email template:', error);
    throw new Error(`Template "${templateName}" not found`);
  }
  
  // Compile templates with Handlebars
  const renderedSubject = renderTemplate(template.subject_template, data);
  const renderedHtml = renderTemplate(template.html_template, data);
  
  // Plain text is optional
  let renderedText: string | undefined;
  if (template.text_template) {
    renderedText = renderTemplate(template.text_template, data);
  }
  
  return {
    subject: renderedSubject,
    html: renderedHtml,
    text: renderedText
  };
};
