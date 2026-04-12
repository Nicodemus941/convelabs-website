
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface StaffErrorStateProps {
  error?: string;
  onRetry: () => void;
}

const StaffErrorState: React.FC<StaffErrorStateProps> = ({ error, onRetry }) => {
  return (
    <Card className="border-destructive">
      <CardContent className="pt-6 text-center">
        <div className="flex flex-col items-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <div>
            <h3 className="text-lg font-medium">Error Loading Staff Data</h3>
            <p className="text-muted-foreground mt-2">
              {error || "There was a problem loading the staff data. Please try again."}
            </p>
          </div>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={onRetry}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default StaffErrorState;
