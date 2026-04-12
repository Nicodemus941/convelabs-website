
import React from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "react-router-dom";
import { AUTH_URL } from "@/lib/constants/urls";

interface LoginPromptProps {
  redirectPath?: string;
}

const LoginPrompt: React.FC<LoginPromptProps> = ({ redirectPath }) => {
  const location = useLocation();
  const redirect = redirectPath || location.pathname;
  const loginUrl = `/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`;

  return (
    <div className="max-w-lg mx-auto text-center">
      <h1 className="text-3xl font-bold mb-6">Login Required</h1>
      <p className="text-lg text-gray-600 mb-8">
        Please log in to your account to continue.
      </p>
      <div className="space-y-4">
        <Button asChild size="lg" className="w-full">
          <a href={AUTH_URL}>Log In</a>
        </Button>
        <p className="text-sm text-gray-500">
          Don't have an account?{" "}
          <a href={AUTH_URL} className="text-conve-red hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
};

export default LoginPrompt;
