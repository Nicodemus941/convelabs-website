import React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useStaffTimeOff } from '@/hooks/admin/useStaffTimeOff';

interface DateBlockFormProps {
  onClose: () => void;
}

const DateBlockForm: React.FC<DateBlockFormProps> = ({ onClose }) => {
  const { createDateBlock } = useStaffTimeOff();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm();

  const handleFormSubmit = async (data: any) => {
    try {
      await createDateBlock(data);
      onClose();
    } catch (error) {
      // Error handled in hook
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="staff_id">Staff Member ID</Label>
        <Input
          id="staff_id"
          {...register('staff_id', { required: 'Staff ID is required' })}
          placeholder="Enter staff member ID"
        />
        {errors.staff_id && (
          <p className="text-sm text-red-600">{errors.staff_id.message as string}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="blocked_date">Date to Block</Label>
        <Input
          id="blocked_date"
          type="date"
          {...register('blocked_date', { required: 'Date is required' })}
        />
        {errors.blocked_date && (
          <p className="text-sm text-red-600">{errors.blocked_date.message as string}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason">Reason for Block</Label>
        <Textarea
          id="reason"
          {...register('reason', { required: 'Reason is required' })}
          placeholder="Enter reason for blocking this date"
          rows={3}
        />
        {errors.reason && (
          <p className="text-sm text-red-600">{errors.reason.message as string}</p>
        )}
      </div>

      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Block Date'}
        </Button>
      </div>
    </form>
  );
};

export default DateBlockForm;