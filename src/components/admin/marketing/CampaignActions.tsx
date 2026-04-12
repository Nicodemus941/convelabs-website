
import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Send, Clock } from 'lucide-react';
import { CardFooter } from '@/components/ui/card';

interface CampaignActionsProps {
  loading: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  hasTemplate: boolean;
  isScheduled?: boolean;
}

const CampaignActions: React.FC<CampaignActionsProps> = ({ 
  loading, 
  onCancel, 
  onSubmit, 
  hasTemplate,
  isScheduled = false 
}) => {
  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <CardFooter className="flex justify-between">
      <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
      <Button 
        onClick={onSubmit} 
        disabled={loading || !hasTemplate}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isScheduled 
          ? <Clock className="mr-2 h-4 w-4" />
          : <Send className="mr-2 h-4 w-4" />
        }
        {isScheduled ? 'Schedule Campaign' : 'Send Campaign'}
      </Button>
    </CardFooter>
  );
};

export default CampaignActions;
