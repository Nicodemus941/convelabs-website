
import React from 'react';
import { format } from 'date-fns';
import { Check, Calendar, Clock, MapPin, Phone, Mail, User, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookingFormValues } from '@/types/appointmentTypes';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import RecurringBookingSetup from './RecurringBookingSetup';

interface BookingConfirmationProps {
  appointmentId: string | null;
  formData: BookingFormValues;
  services: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  tenantName?: string;
}

const BookingConfirmation: React.FC<BookingConfirmationProps> = ({
  appointmentId,
  formData,
  services,
  tenantName = 'ConveLabs'
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGuest = !user;

  const selectedService = services.find(s => s.id === formData.serviceDetails?.selectedService);
  
  return (
    <Card className="border-green-100 shadow-md">
      <CardHeader className="bg-green-50 border-b border-green-100">
        <div className="flex items-center justify-center space-x-2 mb-4">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <Check className="h-6 w-6 text-green-600" />
          </div>
        </div>
        <CardTitle className="text-center text-xl md:text-2xl">Appointment Confirmed!</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-6">
          <p className="text-center text-muted-foreground">
            Thank you for booking with {tenantName}. Your appointment has been scheduled and confirmation details have been sent to your email.
          </p>
          
          {appointmentId && (
            <div className="bg-gray-50 p-3 rounded-md text-center">
              <p className="text-sm text-muted-foreground">Appointment Reference:</p>
              <p className="font-mono text-sm">{appointmentId}</p>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <h3 className="font-medium flex items-center">
                  <Calendar className="mr-2 h-4 w-4" /> Appointment Details
                </h3>
                <div className="ml-6 mt-2 space-y-1">
                  <p className="text-sm flex">
                    <span className="text-muted-foreground w-24">Date:</span>
                    <span>{formData.date ? format(formData.date, 'MMMM d, yyyy') : 'Not specified'}</span>
                  </p>
                  <p className="text-sm flex">
                    <span className="text-muted-foreground w-24">Time:</span>
                    <span>{formData.time || 'Not specified'}</span>
                  </p>
                  <p className="text-sm flex">
                    <span className="text-muted-foreground w-24">Service:</span>
                    <span>{selectedService?.name || 'Not specified'}</span>
                  </p>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium flex items-center">
                  <MapPin className="mr-2 h-4 w-4" /> Location
                </h3>
                <div className="ml-6 mt-2 space-y-1">
                  <p className="text-sm">
                    {formData.locationDetails?.address}<br />
                    {formData.locationDetails?.city}, {formData.locationDetails?.state} {formData.locationDetails?.zipCode}
                  </p>
                  {formData.locationDetails?.instructions && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Instructions: </span>
                      {formData.locationDetails.instructions}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="font-medium flex items-center">
                  <User className="mr-2 h-4 w-4" /> Your Information
                </h3>
                <div className="ml-6 mt-2 space-y-1">
                  <p className="text-sm flex">
                    <span className="text-muted-foreground w-24">Name:</span>
                    <span>{formData.patientDetails?.firstName} {formData.patientDetails?.lastName}</span>
                  </p>
                  <p className="text-sm flex">
                    <span className="text-muted-foreground w-24">Email:</span>
                    <span>{formData.patientDetails?.email}</span>
                  </p>
                  <p className="text-sm flex">
                    <span className="text-muted-foreground w-24">Phone:</span>
                    <span>{formData.patientDetails?.phone}</span>
                  </p>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium flex items-center">
                  <User className="mr-2 h-4 w-4" /> Phlebotomist
                </h3>
                <div className="ml-6 mt-2 space-y-1">
                  <p className="text-sm flex">
                    <span className="text-muted-foreground w-24">Name:</span>
                    <span>Valerie Stoll-Lopez</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Your phlebotomist will contact you before your appointment.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Recurring booking setup */}
          {!isGuest && (
            <RecurringBookingSetup
              serviceType={formData.serviceDetails?.selectedService || 'mobile'}
              preferredDay={formData.date?.getDay()}
              preferredTime={formData.time}
              preferredAddress={formData.locationDetails?.address}
              preferredCity={formData.locationDetails?.city}
              preferredState={formData.locationDetails?.state}
              preferredZip={formData.locationDetails?.zipCode}
            />
          )}

          {isGuest && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <UserPlus className="h-6 w-6 text-blue-600 mx-auto mb-2" />
              <p className="font-medium text-blue-900">Create an account to track your appointments</p>
              <p className="text-sm text-blue-700 mt-1">View status, rebook, and manage your health records.</p>
              <Button
                onClick={() => navigate(`/signup?email=${encodeURIComponent(formData.patientDetails?.email || '')}`)}
                className="mt-3 bg-blue-600 hover:bg-blue-700 text-white"
                size="sm"
              >
                Create Account
              </Button>
            </div>
          )}

          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            {!isGuest && (
              <Button
                onClick={() => navigate('/dashboard')}
                className="w-full sm:w-auto"
              >
                Go to Dashboard
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="w-full sm:w-auto"
            >
              Return to Home
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BookingConfirmation;
