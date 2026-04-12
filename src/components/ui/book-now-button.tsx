
import React from "react";
import { EnhancedBookNowButton } from "@/components/conversion/EnhancedBookNowButton";
import { ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BookNowButtonProps extends Omit<ButtonProps, 'variant'> {
  showNote?: boolean;
  className?: string;
  variant?: ButtonProps['variant'] | "sticky";
  size?: "default" | "sm" | "lg";
  useQuickBooking?: boolean;
}

export const BookNowButton = ({
  showNote = false,
  className,
  variant = "default",
  size = "default",
  useQuickBooking = true,
  ...props
}: BookNowButtonProps) => {
  return (
    <div className="flex flex-col items-center">
      <EnhancedBookNowButton
        source="legacy_book_button"
        variant={variant}
        size={size}
        className={className}
        {...props}
      />
      
      {showNote && (
        <p className="text-xs text-muted-foreground mt-2 max-w-[240px] text-center">
          Book your appointment directly through our booking system.
        </p>
      )}
    </div>
  );
};
