import React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { useCountdown } from '@/hooks/useCountdown';

interface HoldCountdownTimerProps {
  expiresAt: string;
  onExpired: () => void;
}

const HoldCountdownTimer: React.FC<HoldCountdownTimerProps> = ({ expiresAt, onExpired }) => {
  const targetDate = new Date(expiresAt);
  const { minutes, seconds } = useCountdown(targetDate);
  const totalSeconds = minutes * 60 + seconds;

  React.useEffect(() => {
    if (totalSeconds <= 0) {
      onExpired();
    }
  }, [totalSeconds, onExpired]);

  if (totalSeconds <= 0) return null;

  const isUrgent = totalSeconds < 120;

  return (
    <div className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium ${
      isUrgent
        ? 'bg-destructive/10 text-destructive'
        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
    }`}>
      {isUrgent ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      <span>
        Appointment reserved for {minutes}:{seconds.toString().padStart(2, '0')}
      </span>
    </div>
  );
};

export default HoldCountdownTimer;
