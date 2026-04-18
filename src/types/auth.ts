
export type UserRole = 'admin' | 'super_admin' | 'patient' | 'phlebotomist' | 'concierge_doctor' | 'franchise_owner' | 'staff' | 'office_manager' | 'provider';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  full_name?: string;
  role: UserRole;
  createdAt: string;
  phoneNumber?: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: User;
}

export interface AuthResult {
  success: boolean;
  user?: any;
  session?: any;
  data?: {
    user?: any;
    session?: Session;
  };
  error?: {
    message: string;
  };
}

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (email: string, password: string, firstName: string, lastName: string, role?: UserRole) => Promise<AuthResult>;
  resetError: () => void;
  refreshSession: () => Promise<void>;
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: {
    message: string;
  };
  [key: string]: any;
}
