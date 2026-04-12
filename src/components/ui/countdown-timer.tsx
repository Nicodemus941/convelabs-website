
import React, { useState, useEffect } from "react";

interface CountdownTimerProps {
  targetDate: Date;
  className?: string;
  compact?: boolean;
}

export function CountdownTimer({ 
  targetDate,
  className = "",
  compact = false 
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = targetDate.getTime() - new Date().getTime();
      
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60)
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  if (compact) {
    return (
      <div className={`flex items-center space-x-1 ${className}`}>
        <div className="font-mono font-bold">
          {timeLeft.days}d:{String(timeLeft.hours).padStart(2, '0')}h:
          {String(timeLeft.minutes).padStart(2, '0')}m:
          {String(timeLeft.seconds).padStart(2, '0')}s
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center space-x-2 ${className}`}>
      <div className="flex flex-col items-center">
        <span className="text-2xl md:text-3xl font-bold">{timeLeft.days}</span>
        <span className="text-xs uppercase">Days</span>
      </div>
      <span className="text-xl md:text-2xl font-bold">:</span>
      <div className="flex flex-col items-center">
        <span className="text-2xl md:text-3xl font-bold">{String(timeLeft.hours).padStart(2, '0')}</span>
        <span className="text-xs uppercase">Hours</span>
      </div>
      <span className="text-xl md:text-2xl font-bold">:</span>
      <div className="flex flex-col items-center">
        <span className="text-2xl md:text-3xl font-bold">{String(timeLeft.minutes).padStart(2, '0')}</span>
        <span className="text-xs uppercase">Min</span>
      </div>
      <span className="text-xl md:text-2xl font-bold">:</span>
      <div className="flex flex-col items-center">
        <span className="text-2xl md:text-3xl font-bold">{String(timeLeft.seconds).padStart(2, '0')}</span>
        <span className="text-xs uppercase">Sec</span>
      </div>
    </div>
  );
}
