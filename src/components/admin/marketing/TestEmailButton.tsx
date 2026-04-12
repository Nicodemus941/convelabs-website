
import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, SendHorizonal } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TestEmailButtonProps {
  loading: boolean;
  hasTemplate: boolean;
  onSendTest: () => void;
}

const TestEmailButton: React.FC<TestEmailButtonProps> = ({ loading, hasTemplate, onSendTest }) => {
  // Define the tooltip content based on conditions
  const getTooltipContent = () => {
    if (!hasTemplate) {
      return "Please select an email template first";
    }
    return "Send a test email to verify your template and settings";
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button 
              type="button" 
              variant="secondary" 
              onClick={onSendTest}
              disabled={loading || !hasTemplate}
              className="flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending Test...
                </>
              ) : (
                <>
                  <SendHorizonal className="h-4 w-4" />
                  Send Test Email
                </>
              )}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{getTooltipContent()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default TestEmailButton;
