import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

interface AppointmentRatingProps {
  appointmentId: string;
  phlebotomistName?: string;
  onComplete?: () => void;
}

const AppointmentRating: React.FC<AppointmentRatingProps> = ({
  appointmentId,
  phlebotomistName,
  onComplete,
}) => {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('appointment_ratings').insert([{
        appointment_id: appointmentId,
        patient_id: user?.id || null,
        rating,
        comment: comment.trim() || null,
      }]);

      if (error) {
        if (error.code === '23505') {
          toast.error('You have already rated this appointment');
        } else {
          throw error;
        }
      } else {
        setSubmitted(true);
        toast.success('Thank you for your feedback!');
        onComplete?.();
      }
    } catch (err) {
      console.error('Error submitting rating:', err);
      toast.error('Failed to submit rating. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="py-12 text-center">
          <div className="text-4xl mb-4">🙏</div>
          <h3 className="text-xl font-bold">Thank You!</h3>
          <p className="text-muted-foreground mt-2">
            Your feedback helps us provide better service.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Rate Your Experience</CardTitle>
        {phlebotomistName && (
          <p className="text-center text-muted-foreground text-sm">
            How was your visit with {phlebotomistName}?
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Star rating */}
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className="focus:outline-none transition-transform hover:scale-110"
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              onClick={() => setRating(star)}
            >
              <Star
                className={`h-10 w-10 ${
                  star <= (hoveredRating || rating)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-muted-foreground/30'
                }`}
              />
            </button>
          ))}
        </div>

        {rating > 0 && (
          <p className="text-center text-sm font-medium">
            {rating === 5 && 'Excellent!'}
            {rating === 4 && 'Great!'}
            {rating === 3 && 'Good'}
            {rating === 2 && 'Fair'}
            {rating === 1 && 'Poor'}
          </p>
        )}

        {/* Comment */}
        <Textarea
          placeholder="Share more about your experience (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
        />

        <Button
          onClick={handleSubmit}
          disabled={rating === 0 || isSubmitting}
          className="w-full bg-conve-red hover:bg-conve-red-dark text-white"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Review'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default AppointmentRating;
