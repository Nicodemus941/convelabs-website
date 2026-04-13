
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const getUserInfo = async () => {
      try {
        // Check if there's a hash fragment with tokens (from Supabase redirect)
        const hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
          console.log("Found token in URL hash, setting session...");
          // Supabase client auto-detects hash params and creates session
          // Wait a moment for it to process
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const { data } = await supabase.auth.getSession();

        if (data?.session?.user?.email) {
          setEmail(data.session.user.email);
        } else {
          // Try refreshing
          const { data: refreshData } = await supabase.auth.refreshSession();
          if (refreshData?.session?.user?.email) {
            setEmail(refreshData.session.user.email);
          } else {
            toast("Session expired", {
              description: "Please click the reset link in your email again."
            });
          }
        }
      } catch (error) {
        console.error("Error getting session:", error);
      }
    };

    getUserInfo();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Verify we have an active session before attempting update
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        setFormError("Your session has expired. Please click the reset link in your email again.");
        setIsSubmitting(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw error;
      }
      
      setIsSuccess(true);
      toast("Password updated", {
        description: "Your password has been successfully reset"
      });
      console.log("Password updated successfully");

      // Redirect to login page after a short delay
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (error: any) {
      console.error("Error resetting password:", error);
      toast("Error", {
        description: error.message || "Failed to reset password"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-conve-black">
            ConveLabs
            <span className="text-conve-red">.</span>
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Luxury mobile phlebotomy services
          </p>
        </div>

        <Card className="luxury-card">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Reset Password</CardTitle>
            <CardDescription>
              {email ? `Create a new password for ${email}` : 'Create a new password for your account'}
            </CardDescription>
          </CardHeader>

          {isSuccess ? (
            <CardContent className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center">
                <h3 className="text-lg font-medium text-green-800 mb-2">Password updated!</h3>
                <p className="text-green-700">
                  Your password has been reset successfully. You will be redirected to the login page.
                </p>
              </div>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="luxury-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="luxury-input"
                  />
                </div>

                {formError && (
                  <div className="flex items-center p-3 text-sm bg-red-50 text-red-600 rounded-md border border-red-200">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    <span>{formError}</span>
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex-col space-y-4">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full luxury-button"
                >
                  {isSubmitting ? "Updating Password..." : "Reset Password"}
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
