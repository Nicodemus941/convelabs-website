
import React from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { ArrowRight, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { ENROLLMENT_URL, withSource } from "@/lib/constants/urls";

interface MembershipButtonProps extends Omit<ButtonProps, 'variant'> {
  showNote?: boolean;
  className?: string;
  variant?: ButtonProps['variant'];
  size?: "default" | "sm" | "lg";
  children?: React.ReactNode;
}

export const MembershipButton = ({
  showNote = false,
  className,
  variant = "outline",
  size = "default",
  children,
  ...props
}: MembershipButtonProps) => {
  const enrollmentUrl = withSource(ENROLLMENT_URL, 'membership_button');
  
  const handleMembershipClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.location.href = enrollmentUrl;
  };
  
  return (
    <div className="flex flex-col items-center">
      <Button
        className={cn("font-semibold", className)}
        size={size}
        variant={variant}
        {...props}
        asChild
      >
        <a 
          href={enrollmentUrl}
          className="flex items-center gap-2"
          onClick={handleMembershipClick}
        >
          <Shield className="h-4 w-4" />
          {children || "View Membership Plans"}
          <ArrowRight className="h-4 w-4" />
        </a>
      </Button>
      
      {showNote && (
        <p className="text-xs text-muted-foreground mt-2 max-w-[240px] text-center">
          <span className="text-primary font-medium">ConveLabs Membership Portal</span> - 
          Secure access to exclusive pricing & benefits
        </p>
      )}
    </div>
  );
};
