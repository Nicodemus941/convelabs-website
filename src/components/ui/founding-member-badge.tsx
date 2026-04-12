
import React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface FoundingMemberBadgeProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function FoundingMemberBadge({ 
  className, 
  size = "md" 
}: FoundingMemberBadgeProps) {
  const sizeClasses = {
    sm: "text-xs py-0.5 px-1.5",
    md: "text-sm py-1 px-2",
    lg: "text-base py-1.5 px-3"
  };
  
  return (
    <div className={cn(
      "inline-flex items-center bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded font-medium",
      sizeClasses[size],
      className
    )}>
      <Sparkles className={cn(
        "mr-1",
        size === "sm" ? "h-3 w-3" : size === "md" ? "h-4 w-4" : "h-5 w-5"
      )} />
      Founding Member
    </div>
  );
}
