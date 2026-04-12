import React, { useEffect, useState } from 'react';
import { MapPin, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAvailabilityMap } from '@/hooks/useAvailabilityMap';

interface AvailabilityMapProps {
  selectedDate: Date | null;
}

const AvailabilityMap: React.FC<AvailabilityMapProps> = ({ selectedDate }) => {
  const { availableCount, isLoading, fetchAvailability } = useAvailabilityMap();

  useEffect(() => {
    if (selectedDate) {
      fetchAvailability(selectedDate);
    }
  }, [selectedDate]);

  if (!selectedDate) return null;

  return (
    <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
          <Users className="h-5 w-5 text-green-600" />
        </div>
        <div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Checking availability...</p>
          ) : (
            <>
              <p className="font-medium text-sm text-green-800">
                {availableCount} phlebotomist{availableCount !== 1 ? 's' : ''} available
              </p>
              <p className="text-xs text-green-600">
                <MapPin className="h-3 w-3 inline mr-1" />
                Central Florida area for {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AvailabilityMap;
