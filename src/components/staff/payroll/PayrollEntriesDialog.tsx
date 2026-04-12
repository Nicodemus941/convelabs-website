
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePayroll, PayrollPeriod, PayrollEntry } from "@/hooks/usePayroll";
import { format, parseISO } from 'date-fns';
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  CircleDollarSign, 
  Clock, 
  CalendarDays, 
  User, 
  CreditCard,
  CheckCheck
} from "lucide-react";

interface PayrollEntriesDialogProps {
  period: PayrollPeriod;
  open: boolean;
  onClose: () => void;
}

export const PayrollEntriesDialog: React.FC<PayrollEntriesDialogProps> = ({ 
  period, 
  open,
  onClose 
}) => {
  const { payrollEntries, fetchPayrollEntries, updatePayrollEntryStatus, isLoading } = usePayroll();
  const [processingEntryId, setProcessingEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (open && period?.id) {
      fetchPayrollEntries(period.id);
    }
  }, [open, period, fetchPayrollEntries]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  };

  const getStatusBadgeStyle = (status: string) => {
    switch(status) {
      case 'pending':
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case 'processing':
        return "bg-blue-100 text-blue-800 border-blue-300";
      case 'paid':
        return "bg-green-100 text-green-800 border-green-300";
      case 'failed':
        return "bg-red-100 text-red-800 border-red-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const handleUpdateStatus = async (entryId: string, newStatus: 'pending' | 'processing' | 'paid' | 'failed') => {
    setProcessingEntryId(entryId);
    try {
      await updatePayrollEntryStatus(entryId, newStatus);
    } finally {
      setProcessingEntryId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Payroll Entries for {format(parseISO(period.period_start), 'MMM d')} - {format(parseISO(period.period_end), 'MMM d, yyyy')}
          </DialogTitle>
          <DialogDescription>
            Payment date: {format(parseISO(period.payment_date), 'MMMM d, yyyy')} - Status: {period.status}
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : payrollEntries.length === 0 ? (
          <div className="text-center py-8">
            <CircleDollarSign className="mx-auto h-12 w-12 text-gray-400 mb-2" />
            <h3 className="text-lg font-medium">No payroll entries</h3>
            <p className="text-sm text-gray-500 mb-4">
              No payment entries have been generated for this period yet. Use the "Generate Entries" button to create them.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">
                {payrollEntries.length} {payrollEntries.length === 1 ? 'Entry' : 'Entries'}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Total:</span>
                <span className="text-lg font-semibold">
                  {formatCurrency(payrollEntries.reduce((sum, entry) => sum + entry.amount, 0))}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {payrollEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="flex items-center">
                        <h4 className="font-semibold">
                          {entry.staff?.user && 'full_name' in entry.staff.user 
                            ? entry.staff.user.full_name 
                            : 'Unknown Staff'}
                        </h4>
                        <Badge 
                          className={`ml-3 ${getStatusBadgeStyle(entry.status)}`}
                        >
                          {entry.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">
                        {entry.staff?.user && 'email' in entry.staff.user 
                          ? entry.staff.user.email 
                          : 'No email'}
                        {entry.staff?.user?.role && ` (${entry.staff.user.role.replace('_', ' ')})`}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-semibold">
                        {formatCurrency(entry.amount)}
                      </div>
                      {entry.payment_reference && (
                        <p className="text-xs text-gray-500">
                          Ref: {entry.payment_reference}
                        </p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center text-sm">
                        {entry.hours_worked ? (
                          <Clock className="h-4 w-4 text-gray-500 mr-2" />
                        ) : (
                          <CheckCheck className="h-4 w-4 text-gray-500 mr-2" />
                        )}
                        <span>
                          {entry.hours_worked 
                            ? `${entry.hours_worked.toFixed(1)} hours worked` 
                            : `${entry.appointments_completed || 0} appointments completed`}
                        </span>
                      </div>

                      <div className="flex items-center text-sm">
                        <CreditCard className="h-4 w-4 text-gray-500 mr-2" />
                        <span>
                          Payment Method: {entry.payment_method_id 
                            ? 'Configured' 
                            : 'Not specified'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {entry.status !== 'paid' && (
                        <div className="flex items-center justify-end space-x-2">
                          {entry.status === 'pending' && (
                            <Button
                              size="sm"
                              onClick={() => handleUpdateStatus(entry.id, 'processing')}
                              disabled={processingEntryId === entry.id}
                              className="bg-conve-red hover:bg-conve-red/90"
                            >
                              Start Processing
                            </Button>
                          )}
                          
                          {entry.status === 'processing' && (
                            <Button
                              size="sm"
                              onClick={() => handleUpdateStatus(entry.id, 'paid')}
                              disabled={processingEntryId === entry.id}
                            >
                              Mark as Paid
                            </Button>
                          )}
                          
                          {(entry.status === 'processing' || entry.status === 'pending') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdateStatus(entry.id, 'failed')}
                              disabled={processingEntryId === entry.id}
                            >
                              Mark as Failed
                            </Button>
                          )}
                        </div>
                      )}
                      
                      {entry.status === 'paid' && entry.payment_date && (
                        <div className="flex items-center justify-end text-sm text-gray-500">
                          <CalendarDays className="h-4 w-4 mr-1" />
                          Paid on {format(parseISO(entry.payment_date), 'MMM d, yyyy')}
                        </div>
                      )}
                    </div>
                  </div>

                  {entry.notes && (
                    <div className="text-sm text-gray-600 mt-2 pt-2 border-t">
                      Notes: {entry.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
