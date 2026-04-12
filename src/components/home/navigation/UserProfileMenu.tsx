import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTenant } from "@/contexts/tenant/TenantContext";
import { Button } from "@/components/ui/button";
import { Building, LogOut, Settings, User, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

const UserProfileMenu = () => {
  const { user, logout } = useAuth();
  const { userTenants, currentTenant, switchTenant } = useTenant();
  const navigate = useNavigate();
  const { toast } = useToast();

  const getInitials = () => {
    if (!user) return "?";
    const firstName = user.firstName || "";
    const lastName = user.lastName || "";
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const handleLogout = async () => {
    try {
      console.log("UserProfileMenu: Handling logout");
      
      // Clear all auth-related localStorage items
      localStorage.removeItem('convelabs_user');
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('sb-yluyonhrxxtyuiyrdixl-auth-token');
      
      // Use direct Supabase signOut to ensure we properly terminate all sessions
      await supabase.auth.signOut({ scope: 'global' });
      
      // Then call our logout function for any cleanup
      await logout();
      
      // Show success message
      toast({
        title: "Logged out successfully",
        description: "You have been logged out of your account",
      });
      
      // Force navigation to home page with replace to prevent back navigation
      navigate("/", { replace: true });
      
      // Adding a small delay and second navigation as fallback
      setTimeout(() => {
        window.location.href = "/";
      }, 100);
      
    } catch (error) {
      console.error("Logout failed:", error);
      toast({
        variant: "destructive",
        title: "Logout failed",
        description: "There was an issue logging out. Please try again.",
      });
      
      // Even if there's an error, navigate to home
      navigate("/", { replace: true });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10 border">
            <AvatarFallback>{getInitials()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {userTenants.length > 0 && (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-xs text-muted-foreground">
                  Your Organizations
                </p>
              </div>
            </DropdownMenuLabel>
            {userTenants.map((tenant) => (
              <DropdownMenuItem
                key={tenant.id}
                className="cursor-pointer"
                onClick={() => {
                  switchTenant(tenant.tenant_id || tenant.id);
                  navigate(`/tenant/dashboard/${tenant.tenant_id || tenant.id}`);
                }}
              >
                <Building className="mr-2 h-4 w-4" />
                <span>{currentTenant?.name || 'Unnamed Organization'}</span>
                {currentTenant?.id === (tenant.tenant_id || tenant.id) && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Current
                  </span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => navigate('/tenant/onboarding')}
            >
              <Building className="mr-2 h-4 w-4" />
              <span>Create Organization</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        
        <DropdownMenuItem 
          className="cursor-pointer"
          onClick={() => navigate('/profile')}
        >
          <User className="mr-2 h-4 w-4" />
          <span>My Profile</span>
        </DropdownMenuItem>
        
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => navigate('/dashboard')}
        >
          <Settings className="mr-2 h-4 w-4" />
          <span>Dashboard</span>
        </DropdownMenuItem>
        
        {userTenants.length === 0 && (
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => navigate('/tenant/onboarding')}
          >
            <Building className="mr-2 h-4 w-4" />
            <span>Create Organization</span>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserProfileMenu;
