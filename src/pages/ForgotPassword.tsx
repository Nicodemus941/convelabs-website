
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Use custom edge function that sends via Mailgun (bypasses Supabase email limits)
      const { data, error } = await supabase.functions.invoke('send-password-reset', {
        body: { email: email.trim() },
      });

      if (error) throw error;

      setIsSuccess(true);
      toast("Recovery email sent", {
        description: "Check your inbox for the password reset link"
      });
    } catch (error: any) {
      console.error("Error sending password reset email:", error);
      // Still show success (don't reveal if email exists)
      setIsSuccess(true);
      toast("Recovery email sent", {
        description: "If this email is in our system, a reset link has been sent"
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
            <Link to="/login" className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to login
            </Link>
            <CardTitle className="text-xl font-semibold">Forgot Password</CardTitle>
            <CardDescription>
              Enter your email and we'll send you a link to reset your password
            </CardDescription>
          </CardHeader>

          {isSuccess ? (
            <CardContent className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center">
                <h3 className="text-lg font-medium text-green-800 mb-2">Recovery email sent!</h3>
                <p className="text-green-700">
                  Check your inbox for a link to reset your password. The link will expire in 10 minutes.
                </p>
              </div>
              <Button
                onClick={() => window.location.href = "/login"}
                className="w-full luxury-button"
              >
                Return to login
              </Button>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="luxury-input"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex-col space-y-4">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full luxury-button"
                >
                  {isSubmitting ? "Sending..." : "Send Reset Link"}
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
