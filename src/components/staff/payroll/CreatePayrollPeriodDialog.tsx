
import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, addDays } from 'date-fns';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { usePayroll } from '@/hooks/usePayroll';

interface CreatePayrollPeriodDialogProps {
  open: boolean;
  onClose: () => void;
}

const CreatePayrollPeriodDialog: React.FC<CreatePayrollPeriodDialogProps> = ({ 
  open, 
  onClose 
}) => {
  const { createPayrollPeriod, isLoading } = usePayroll();
  
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(addDays(new Date(), 13));
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(addDays(new Date(), 15));
  const [startCalendarOpen, setStartCalendarOpen] = useState(false);
  const [endCalendarOpen, setEndCalendarOpen] = useState(false);
  const [paymentCalendarOpen, setPaymentCalendarOpen] = useState(false);

  const handleCreate = async () => {
    if (!startDate || !endDate || !paymentDate) return;

    try {
      await createPayrollPeriod(startDate, endDate, paymentDate);
      onClose();
    } catch (error) {
      console.error("Error creating payroll period:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Payroll Period</DialogTitle>
          <DialogDescription>
            Set up a new payroll period for processing staff payments
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="start-date">Period Start Date</Label>
            <Popover open={startCalendarOpen} onOpenChange={setStartCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="start-date"
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    setStartDate(date);
                    setStartCalendarOpen(false);
                    if (date && (!endDate || date > endDate)) {
                      setEndDate(addDays(date, 13));
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="end-date">Period End Date</Label>
            <Popover open={endCalendarOpen} onOpenChange={setEndCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="end-date"
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => {
                    setEndDate(date);
                    setEndCalendarOpen(false);
                    if (date && (!paymentDate || date >= paymentDate)) {
                      setPaymentDate(addDays(date, 2));
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="payment-date">Payment Date</Label>
            <Popover open={paymentCalendarOpen} onOpenChange={setPaymentCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="payment-date"
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {paymentDate ? format(paymentDate, 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={paymentDate}
                  onSelect={(date) => {
                    setPaymentDate(date);
                    setPaymentCalendarOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleCreate} 
            disabled={!startDate || !endDate || !paymentDate || isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Period
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePayrollPeriodDialog;
