
import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffProfiles, StaffProfile } from '@/hooks/useStaffProfiles';
import { usePayroll } from '@/hooks/usePayroll';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, CreditCard, CheckCircle, Trash2 } from 'lucide-react';

// Define component props
interface PaymentMethodsTabProps {
  staffProfile: StaffProfile | null;
  isAdmin: boolean;
}

const PaymentMethodsTab: React.FC<PaymentMethodsTabProps> = ({ staffProfile, isAdmin }) => {
  const { user } = useAuth();
  const { getStaffProfileByUserId } = useStaffProfiles();
  const { 
    paymentMethods, 
    fetchPaymentMethods, 
    savePaymentMethod, 
    deletePaymentMethod, 
    isLoading 
  } = usePayroll();

  useEffect(() => {
    if (staffProfile) {
      fetchPaymentMethods(staffProfile.id);
    }
  }, [staffProfile, fetchPaymentMethods]);

  const handleAddMethod = () => {
    // Implement adding payment method UI
    console.log("Add payment method");
  };

  const handleSetDefault = async (methodId: string) => {
    if (!staffProfile) return;
    
    try {
      await savePaymentMethod(staffProfile.id, {
        id: methodId,
        is_default: true
      });
    } catch (error) {
      console.error("Error setting default method:", error);
    }
  };

  const handleDelete = async (methodId: string) => {
    try {
      await deletePaymentMethod(methodId);
    } catch (error) {
      console.error("Error deleting payment method:", error);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
          <CardDescription>Manage your payment options</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Methods</CardTitle>
        <CardDescription>Manage how you receive your payments</CardDescription>
      </CardHeader>
      <CardContent>
        {!staffProfile ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground">Staff profile not found</p>
          </div>
        ) : paymentMethods.length === 0 ? (
          <div className="text-center py-6">
            <CreditCard className="mx-auto h-12 w-12 text-gray-400 mb-2" />
            <h3 className="font-medium">No payment methods</h3>
            <p className="text-sm text-muted-foreground">
              Add a payment method to receive your earnings
            </p>
            <Button onClick={handleAddMethod} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Add Payment Method
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Button onClick={handleAddMethod}>
              <Plus className="mr-2 h-4 w-4" />
              Add Payment Method
            </Button>
            
            <div className="space-y-3">
              {paymentMethods.map((method) => (
                <div key={method.id} className="flex items-center justify-between border rounded-md p-3">
                  <div className="flex items-center">
                    <CreditCard className="h-5 w-5 mr-2 text-gray-500" />
                    <div>
                      <p className="font-medium capitalize">
                        {method.method_type.replace('_', ' ')}
                        {method.is_default && (
                          <span className="ml-2 text-xs bg-green-100 text-green-800 py-0.5 px-2 rounded-full">
                            Default
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Added on {new Date(method.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {!method.is_default && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(method.id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Set Default
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(method.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PaymentMethodsTab;
