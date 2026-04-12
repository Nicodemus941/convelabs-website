
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import TenantSignupForm from '@/components/tenant/TenantSignupForm';

const TenantSignup: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">Create Your Organization</CardTitle>
            <CardDescription>
              Sign up for a new tenant account and get started with our services
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TenantSignupForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TenantSignup;
