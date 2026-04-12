
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const DemoPatient: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  
  const createDemoPatient = async () => {
    setIsLoading(true);
    try {
      // Try to sign in first since demo user likely exists
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: 'demo@gmail.com',
        password: 'Nick2024',
      });
      
      if (!signInError && signInData?.session) {
        toast.success('Signed in as demo patient');
        navigate('/appointments');
        return;
      }
      
      // If sign-in fails for some reason other than "user not found", show the error
      if (signInError && signInError.message !== "Invalid login credentials") {
        throw signInError;
      }
      
      // Using a simplified approach for auth signup
      const authResponse = await supabase.auth.signUp({
        email: 'demo@gmail.com',
        password: 'Nick2024',
        options: {
          data: {
            firstName: 'Demo',
            lastName: 'Patient',
            full_name: 'Demo Patient',
            role: 'patient'
          }
        }
      });
      
      if (authResponse.error) {
        // If user already exists, try to sign in again
        if (authResponse.error.message.includes("User already registered")) {
          const { error: retrySignInError } = await supabase.auth.signInWithPassword({
            email: 'demo@gmail.com',
            password: 'Nick2024',
          });
          
          if (retrySignInError) throw retrySignInError;
          toast.success('Signed in as demo patient');
          navigate('/appointments');
          return;
        }
        throw authResponse.error;
      }
      
      const userId = authResponse.data?.user?.id;
      
      // Update user profile with additional info
      if (userId) {
        // Create a profile object with explicit typing and all required fields
        const profileData = {
          id: userId,
          full_name: 'Demo Patient',
          address_street: '123 Test Street',
          address_city: 'Orlando',
          address_state: 'FL',
          address_zipcode: '32801',
          date_of_birth: new Date('1990-01-01').toISOString(),
          phone: '555-123-4567'
        };
        
        const { error: profileError } = await supabase
          .from('user_profiles')
          .upsert(profileData);
          
        if (profileError) throw profileError;
      }
      
      toast.success('Demo patient account created successfully');
      navigate('/appointments');
    } catch (error: any) {
      console.error('Error creating demo patient:', error);
      toast.error(`Failed to create demo patient: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const navigateToAppointments = () => {
    navigate('/appointments');
  };

  return (
    <div className="container mx-auto py-10">
      <Helmet>
        <title>Demo Patient Setup | ConveLabs</title>
      </Helmet>
      
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Demo Patient Setup</CardTitle>
          <CardDescription>
            Create a demo patient account for testing the appointment booking flow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              value="demo@gmail.com" 
              disabled 
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input 
              id="password" 
              type="password" 
              value="Nick2024" 
              disabled 
            />
          </div>
          
          <div className="flex flex-col space-y-2">
            <Button 
              onClick={createDemoPatient} 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Demo Patient...
                </>
              ) : (
                'Create & Login as Demo Patient'
              )}
            </Button>
            
            <Button 
              onClick={navigateToAppointments}
              variant="outline" 
              className="w-full"
            >
              Go to Appointment Booking
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DemoPatient;
