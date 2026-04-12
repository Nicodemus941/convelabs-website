
import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface SubmitButtonProps {
  isSubmitting: boolean;
  onClick?: () => void;
  text?: string;
  variant?: 'default' | 'outline' | 'secondary';
  disabled?: boolean;
}

const SubmitButton: React.FC<SubmitButtonProps> = ({ 
  isSubmitting, 
  onClick, 
  text = 'Submit', 
  variant = 'default',
  disabled = false
}) => {
  return (
    <Button 
      type={onClick ? "button" : "submit"} 
      disabled={isSubmitting || disabled}
      onClick={onClick}
      variant={variant}
    >
      {isSubmitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </>
      ) : text}
    </Button>
  );
};

export default SubmitButton;
