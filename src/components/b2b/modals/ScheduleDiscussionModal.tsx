import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, Clock, X, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const scheduleFormSchema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(10, 'Valid phone number is required'),
  company: z.string().min(2, 'Company name is required'),
  industry: z.enum(['healthcare', 'talent', 'sports', 'corporate']),
  preferredTime: z.string().min(1, 'Please select a preferred time'),
  message: z.string().optional(),
});

type ScheduleFormData = z.infer<typeof scheduleFormSchema>;

interface ScheduleDiscussionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ScheduleDiscussionModal: React.FC<ScheduleDiscussionModalProps> = ({ isOpen, onClose }) => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      company: '',
      industry: 'healthcare',
      preferredTime: '',
      message: '',
    },
  });

  const onSubmit = async (data: ScheduleFormData) => {
    setIsSubmitting(true);
    try {
      console.log('Schedule request submitted:', data);
      
      const { data: result, error } = await supabase.functions.invoke('corporate-schedule-demo', {
        body: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          company: data.company,
          industry: data.industry,
          preferredTime: data.preferredTime,
          message: data.message,
        }
      });

      if (error) {
        throw error;
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to schedule demo');
      }
      
      setIsSubmitted(true);
    } catch (error) {
      console.error('Form submission error:', error);
      // You might want to show an error toast here
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setIsSubmitted(false);
      form.reset();
      onClose();
    }
  };

  if (isSubmitted) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <div className="text-center py-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            </motion.div>
            <h3 className="text-2xl font-bold text-gray-800 mb-4">Discussion Scheduled!</h3>
            <p className="text-gray-600 mb-6">
              Thank you for your interest in partnering with ConveLabs. Our team will contact you within 24 hours to confirm your consultation time.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <h4 className="font-semibold text-gray-800 mb-2">What's Next?</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>• Partnership specialist will call to confirm timing</p>
                <p>• Custom ROI analysis preparation</p>
                <p>• 30-minute consultation scheduled</p>
                <p>• Proposal and next steps discussion</p>
              </div>
            </div>
            <Button onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Calendar className="w-6 h-6 text-conve-red" />
            Schedule Partnership Discussion
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                {...form.register('firstName')}
                placeholder="John"
                className="mt-1"
              />
              {form.formState.errors.firstName && (
                <p className="text-red-500 text-sm mt-1">
                  {form.formState.errors.firstName.message}
                </p>
              )}
            </div>
            
            <div>
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                {...form.register('lastName')}
                placeholder="Smith"
                className="mt-1"
              />
              {form.formState.errors.lastName && (
                <p className="text-red-500 text-sm mt-1">
                  {form.formState.errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                {...form.register('email')}
                placeholder="john@company.com"
                className="mt-1"
              />
              {form.formState.errors.email && (
                <p className="text-red-500 text-sm mt-1">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
            
            <div>
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                {...form.register('phone')}
                placeholder="(555) 123-4567"
                className="mt-1"
              />
              {form.formState.errors.phone && (
                <p className="text-red-500 text-sm mt-1">
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="company">Company *</Label>
              <Input
                id="company"
                {...form.register('company')}
                placeholder="Your Company Name"
                className="mt-1"
              />
              {form.formState.errors.company && (
                <p className="text-red-500 text-sm mt-1">
                  {form.formState.errors.company.message}
                </p>
              )}
            </div>
            
            <div>
              <Label htmlFor="industry">Industry *</Label>
              <Select 
                value={form.watch('industry')} 
                onValueChange={(value) => form.setValue('industry', value as any)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="healthcare">Healthcare Provider</SelectItem>
                  <SelectItem value="talent">Talent Agency</SelectItem>
                  <SelectItem value="sports">Sports Organization</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="preferredTime">Preferred Meeting Time *</Label>
            <Select 
              onValueChange={(value) => form.setValue('preferredTime', value)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select preferred time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Morning (9AM - 12PM EST)</SelectItem>
                <SelectItem value="afternoon">Afternoon (12PM - 5PM EST)</SelectItem>
                <SelectItem value="evening">Evening (5PM - 7PM EST)</SelectItem>
                <SelectItem value="flexible">Flexible - Any time</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.preferredTime && (
              <p className="text-red-500 text-sm mt-1">
                {form.formState.errors.preferredTime.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="message">Additional Information</Label>
            <Textarea
              id="message"
              {...form.register('message')}
              placeholder="Tell us about your partnership goals, timeline, or any specific questions..."
              rows={3}
              className="mt-1"
            />
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-blue-800">Meeting Details</p>
                <p className="text-blue-700">
                  30-minute consultation via video call or phone. We'll discuss your specific needs, 
                  review partnership options, and provide a custom ROI analysis.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-conve-red hover:bg-conve-red-dark"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Scheduling...' : 'Schedule Discussion'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleDiscussionModal;