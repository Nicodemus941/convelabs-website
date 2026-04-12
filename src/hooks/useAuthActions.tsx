
import { useState } from "react";
import { UserRole, AuthResult } from "@/types/auth";
import { useSuperAdminAuth } from "./auth/useSuperAdminAuth";
import { useRegularLogin } from "./auth/useRegularLogin";
import { useSignup } from "./auth/useSignup";
import { useLogout } from "./auth/useLogout";

export const useAuthActions = () => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Import all the separate auth hooks
  const { handleSuperAdminLogin } = useSuperAdminAuth();
  const { login: regularLogin } = useRegularLogin();
  const { signup: signupUser } = useSignup();
  const { logout: logoutUser } = useLogout();

  // Login function that delegates to super admin or regular login
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Special handling for super admin account
      if (email.toLowerCase() === "nicodemmebaptiste@convelabs.com") {
        await handleSuperAdminLogin(email, password);
      } else {
        await regularLogin(email, password);
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Signup function 
  const signup = async (
    email: string, 
    password: string, 
    firstName: string, 
    lastName: string, 
    role: UserRole = "patient"
  ): Promise<AuthResult> => {
    return signupUser(email, password, firstName, lastName, role);
  };

  // Logout function
  const logout = async () => {
    await logoutUser();
  };

  const resetError = () => {
    setError(null);
  };

  return {
    login,
    logout,
    signup,
    resetError,
    error,
    isLoading
  };
};
