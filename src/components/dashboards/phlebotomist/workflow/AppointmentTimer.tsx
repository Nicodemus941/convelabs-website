
import React from 'react';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';

interface AppointmentTimerProps {
  timer: {
    running: boolean;
    startTime: number;
    elapsed: number;
  };
  startTimer: () => void;
  stopTimer: () => void;
  formatTime: (milliseconds: number) => string;
}

export const AppointmentTimer: React.FC<AppointmentTimerProps> = ({
  timer,
  startTimer,
  stopTimer,
  formatTime,
}) => {
  return (
    <div className="flex items-center">
      <div className="text-sm font-medium mr-2">{formatTime(timer.elapsed)}</div>
      {!timer.running ? (
        <Button variant="outline" size="sm" onClick={startTimer}>
          <Clock className="h-4 w-4 mr-1" /> Start Timer
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={stopTimer}>
          <Clock className="h-4 w-4 mr-1" /> Stop Timer
        </Button>
      )}
    </div>
  );
};
