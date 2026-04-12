import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import UserProfileMenu from "./UserProfileMenu";
import { BookNowButton } from "@/components/ui/book-now-button";
import { AUTH_URL } from "@/lib/constants/urls";

const UserAuthSection = () => {
  const {
    user,
    isLoading
  } = useAuth();

  // Show loading spinner while auth state is being determined
  if (isLoading) {
    return <div className="hidden lg:flex items-center space-x-4">
        <div className="h-8 w-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
        </div>
      </div>;
  }
  const handleRedirectToRegister = () => {
    window.location.href = AUTH_URL;
  };
  const handleRedirectToLogin = () => {
    window.location.href = AUTH_URL;
  };
  return <div className="hidden lg:flex items-center space-x-4">
      {user ? <UserProfileMenu /> : null}
    </div>;
};
export default UserAuthSection;
