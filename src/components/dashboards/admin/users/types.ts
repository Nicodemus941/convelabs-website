
import { z } from "zod";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

export interface NewUser {
  name: string;
  email: string;
  role: string;
  password: string;
}

// Zod schema for user form validation
export const userFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  email: z.string().email({ message: "Please enter a valid email address" }),
  role: z.string().min(1, { message: "Please select a role" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }).optional().or(z.literal("")),
});

export type UserFormValues = z.infer<typeof userFormSchema>;
