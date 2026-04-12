import React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useStaffTimeOff } from '@/hooks/admin/useStaffTimeOff';

interface TimeOffRequestFormProps {
  onClose: () => void;
}

const TimeOffRequestForm: React.FC<TimeOffRequestFormProps> = ({ onClose }) => {
  const { createTimeOffRequest } = useStaffTimeOff();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm();

  const handleFormSubmit = async (data: any) => {
    try {
      await createTimeOffRequest(data);
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start_date">Start Date</Label>
          <Input
            id="start_date"
            type="date"
            {...register('start_date', { required: 'Start date is required' })}
          />
          {errors.start_date && (
            <p className="text-sm text-red-600">{errors.start_date.message as string}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="end_date">End Date</Label>
          <Input
            id="end_date"
            type="date"
            {...register('end_date', { required: 'End date is required' })}
          />
          {errors.end_date && (
            <p className="text-sm text-red-600">{errors.end_date.message as string}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="request_type">Request Type</Label>
        <Select onValueChange={(value) => setValue('request_type', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select request type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vacation">Vacation</SelectItem>
            <SelectItem value="sick">Sick Leave</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason">Reason</Label>
        <Textarea
          id="reason"
          {...register('reason')}
          placeholder="Optional reason for time off request"
          rows={3}
        />
      </div>

      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit Request'}
        </Button>
      </div>
    </form>
  );
};

export default TimeOffRequestForm;