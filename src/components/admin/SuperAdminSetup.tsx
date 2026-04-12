
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { setupSuperAdminAccess } from '@/utils/setupSuperAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, CheckCircle } from 'lucide-react';

const SuperAdminSetup = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleSetupSuperAdmin = async () => {
    if (!user?.email) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No user email found",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await setupSuperAdminAccess(user.email);
      
      if (result.success) {
        setIsSetup(true);
        toast({
          title: "Success!",
          description: "Super admin access has been configured. Please refresh the page.",
        });
        
        // Refresh the page after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        toast({
          variant: "destructive",
          title: "Setup Failed",
          description: result.error || "Failed to setup super admin access",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (user?.role === 'super_admin') {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
          <CardTitle className="text-green-700">Super Admin Access Active</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-gray-600 mb-4">
            You already have super admin access and can view all analytics dashboards.
          </p>
          <Button asChild>
            <a href="/dashboard/super_admin">Go to Super Admin Dashboard</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader className="text-center">
        <Shield className="h-12 w-12 text-blue-500 mx-auto mb-2" />
        <CardTitle>Setup Super Admin Access</CardTitle>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-gray-600 mb-4">
          Click the button below to configure super admin access for your account. 
          This will give you access to all analytics and admin features.
        </p>
        <Button 
          onClick={handleSetupSuperAdmin}
          disabled={isLoading || isSetup}
          className="w-full"
        >
          {isLoading ? "Setting up..." : isSetup ? "Setup Complete!" : "Setup Super Admin Access"}
        </Button>
        
        {user?.email && (
          <p className="text-sm text-gray-400 mt-2">
            Account: {user.email}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default SuperAdminSetup;
