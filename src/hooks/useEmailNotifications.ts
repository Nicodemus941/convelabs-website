
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { sendTemplatedEmail, sendAppointmentConfirmation, sendFranchiseNotification } from '@/services/email';

export const useEmailNotifications = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Send membership confirmation email
  const sendMembershipConfirmationEmail = async (
    planName: string, 
    startDate: string,
    billingFrequency: string,
    nextBillingDate: string,
    email: string
  ) => {
    setLoading(true);
    try {
      const result = await sendTemplatedEmail({
        to: email,
        templateName: 'membership-confirmation',
        templateData: {
          planName,
          startDate,
          billingFrequency,
          nextBillingDate,
          firstName: user?.firstName || ''
        },
        userId: user?.id
      });

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to send email');
      }

      return true;
    } catch (error) {
      console.error('Error in sendMembershipConfirmationEmail:', error);
      toast({
        title: "Error",
        description: "Failed to send membership confirmation email.",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Send appointment confirmation email
  const sendAppointmentConfirmationEmail = async (appointmentId: string) => {
    setLoading(true);
    try {
      const result = await sendAppointmentConfirmation(appointmentId);
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to send email');
      }
      
      return true;
    } catch (error) {
      console.error('Error in sendAppointmentConfirmationEmail:', error);
      toast({
        title: "Error",
        description: "Failed to send appointment confirmation email.",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Send franchise application notification
  const sendFranchiseApplicationEmail = async (
    fullName: string,
    email: string, 
    phone: string,
    location: string,
    hasExperience: string,
    estimatedBudget: string
  ) => {
    setLoading(true);
    try {
      const result = await sendFranchiseNotification({
        fullName,
        email,
        phone,
        location,
        hasExperience,
        estimatedBudget
      });
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to send notification');
      }
      
      return true;
    } catch (error) {
      console.error('Error in sendFranchiseApplicationEmail:', error);
      toast({
        title: "Error",
        description: "Failed to send notification email.",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    sendMembershipConfirmationEmail,
    sendAppointmentConfirmationEmail,
    sendFranchiseApplicationEmail
  };
};
