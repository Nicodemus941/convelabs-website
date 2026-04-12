
import React, { useState, useEffect } from 'react';
import { usePayroll } from '@/hooks/usePayroll';
import { Button } from '@/components/ui/button';
import { format, parseISO, addDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Loader2, Calendar, Plus } from 'lucide-react';
import { PayrollEntriesDialog } from './PayrollEntriesDialog';
import CreatePayrollPeriodDialog from './CreatePayrollPeriodDialog';

const PayrollPeriodsTab: React.FC = () => {
  const { 
    payrollPeriods, 
    fetchPayrollPeriods,
    updatePayrollPeriodStatus,
    generatePayrollEntries,
    isLoading 
  } = usePayroll();
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const [entriesDialogOpen, setEntriesDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useEffect(() => {
    fetchPayrollPeriods();
  }, [fetchPayrollPeriods]);

  const handleViewEntries = (period: any) => {
    setSelectedPeriod(period);
    setEntriesDialogOpen(true);
  };

  const getStatusStyles = (status: string) => {
    switch(status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'paid':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const handleStatusUpdate = async (periodId: string, newStatus: 'pending' | 'processing' | 'paid') => {
    await updatePayrollPeriodStatus(periodId, newStatus);
  };

  const handleGenerateEntries = async (periodId: string) => {
    await generatePayrollEntries(periodId);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Payroll Periods</h2>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Payroll Period
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : payrollPeriods.length === 0 ? (
        <div className="text-center py-12 border rounded-md bg-background">
          <Calendar className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No Payroll Periods Found</h3>
          <p className="text-muted-foreground mt-2 mb-6">
            Create your first payroll period to start managing staff payments
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            Create Payroll Period
          </Button>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Payment Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollPeriods.map((period) => (
                <TableRow key={period.id} className="hover:bg-accent/50">
                  <TableCell>
                    <div className="font-medium">
                      {format(parseISO(period.period_start), 'MMM d')} - {format(parseISO(period.period_end), 'MMM d, yyyy')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created on {format(parseISO(period.created_at), 'MMM d, yyyy')}
                    </div>
                  </TableCell>
                  <TableCell>
                    {format(parseISO(period.payment_date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${getStatusStyles(period.status)}`}>
                      {period.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleViewEntries(period)}>
                        View Entries
                      </Button>
                      
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleGenerateEntries(period.id)}
                        disabled={period.status === 'paid'}
                      >
                        Generate Entries
                      </Button>
                      
                      {period.status === 'pending' && (
                        <Button 
                          size="sm" 
                          onClick={() => handleStatusUpdate(period.id, 'processing')}
                        >
                          Start Processing
                        </Button>
                      )}
                      
                      {period.status === 'processing' && (
                        <Button 
                          size="sm" 
                          onClick={() => handleStatusUpdate(period.id, 'paid')}
                        >
                          Mark as Paid
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedPeriod && (
        <PayrollEntriesDialog 
          period={selectedPeriod}
          open={entriesDialogOpen}
          onClose={() => setEntriesDialogOpen(false)}
        />
      )}
      
      <CreatePayrollPeriodDialog 
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />
    </div>
  );
};

export default PayrollPeriodsTab;
