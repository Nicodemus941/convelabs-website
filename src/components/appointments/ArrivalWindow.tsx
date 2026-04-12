
import React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';

interface ArrivalWindowProps {
  startTime: Date;
  endTime: Date;
  isExact?: boolean;
}

const ArrivalWindow: React.FC<ArrivalWindowProps> = ({ 
  startTime, 
  endTime,
  isExact = false
}) => {
  const formatTime = (date: Date) => format(date, 'h:mm a');
  
  return (
    <div className="flex items-center space-x-2">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <Badge variant="outline" className={isExact ? "bg-green-50" : "bg-blue-50"}>
        {isExact ? 
          formatTime(startTime) : 
          `${formatTime(startTime)} - ${formatTime(endTime)}`
        }
      </Badge>
      {!isExact && (
        <span className="text-xs text-muted-foreground">Estimated arrival window</span>
      )}
    </div>
  );
};

export default ArrivalWindow;
