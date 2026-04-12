
import { z } from 'zod';

export const signupSchema = z.object({
  organizationName: z.string().min(2, 'Organization name must have at least 2 characters'),
  contactName: z.string().min(2, 'Contact name must have at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  organizationType: z.string(),
  teamSize: z.string(),
  message: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

export type PhlebotomistSignupFormValues = z.infer<typeof signupSchema> & {
  subscriptionTierId?: string
};

export const defaultValues = {
  organizationName: '',
  contactName: '',
  email: '',
  phone: '',
  organizationType: 'independent',
  teamSize: '1',
  message: '',
  password: '',
  confirmPassword: '',
};
