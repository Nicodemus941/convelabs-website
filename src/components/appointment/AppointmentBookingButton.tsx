
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AppointmentBookingButton: React.FC = () => {
  const navigate = useNavigate();

  const handleCreateAppointment = () => {
    // Navigate to the internal appointment booking page
    navigate('/book-now');
  };

  return (
    <Button onClick={handleCreateAppointment} className="flex items-center gap-1">
      <Plus className="h-4 w-4" />
      New Appointment
    </Button>
  );
};

export default AppointmentBookingButton;
