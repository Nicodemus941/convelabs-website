import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, User, Shield, Stethoscope, ChevronDown } from "lucide-react";
import UserProfileMenu from "./UserProfileMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const UserAuthSection = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="hidden lg:flex items-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="hidden lg:flex items-center">
        <UserProfileMenu />
      </div>
    );
  }

  return (
    <div className="hidden lg:flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="text-sm font-medium text-gray-700 hover:text-conve-red">
            Login <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Select your portal</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/login?redirect=/dashboard/patient" className="flex items-center gap-2 cursor-pointer">
              <User className="h-4 w-4 text-blue-600" />
              <div>
                <div className="font-medium text-sm">Patient Portal</div>
                <div className="text-xs text-muted-foreground">View appointments & records</div>
              </div>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/login?redirect=/dashboard" className="flex items-center gap-2 cursor-pointer">
              <Shield className="h-4 w-4 text-green-600" />
              <div>
                <div className="font-medium text-sm">Staff Portal</div>
                <div className="text-xs text-muted-foreground">Admin & phlebotomist access</div>
              </div>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/provider" className="flex items-center gap-2 cursor-pointer">
              <Stethoscope className="h-4 w-4 text-purple-600" />
              <div>
                <div className="font-medium text-sm">Provider Portal</div>
                <div className="text-xs text-muted-foreground">Partner organizations — SMS sign-in</div>
              </div>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/signup" className="flex items-center justify-center cursor-pointer text-conve-red font-medium text-sm">
              Create Account
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default UserAuthSection;
