import React from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import AppointmentRating from '@/components/rating/AppointmentRating';

const RateAppointment: React.FC = () => {
  const { appointmentId } = useParams<{ appointmentId: string }>();

  if (!appointmentId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Invalid rating link.</p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Rate Your Appointment - ConveLabs</title>
      </Helmet>
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <AppointmentRating
          appointmentId={appointmentId}
          onComplete={() => {
            // Optionally redirect after a delay
            setTimeout(() => {
              window.location.href = '/';
            }, 3000);
          }}
        />
      </div>
    </>
  );
};

export default RateAppointment;
