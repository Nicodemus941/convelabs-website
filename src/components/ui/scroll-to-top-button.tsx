
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export const ScrollToTopButton = () => {
  const [isVisible, setIsVisible] = useState(false);
  const isMobile = useIsMobile();
  
  useEffect(() => {
    // Show button when scrolled down 300px
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };
    
    window.addEventListener("scroll", toggleVisibility);
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);
  
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  };
  
  // Only show when scrolled down AND on mobile
  if (!isMobile || !isVisible) return null;
  
  return (
    <Button
      onClick={scrollToTop}
      size="icon"
      className="fixed bottom-20 right-4 z-40 h-10 w-10 rounded-full shadow-lg bg-conve-red hover:bg-conve-red/90"
      aria-label="Scroll to top"
    >
      <ArrowUp className="h-5 w-5" />
    </Button>
  );
};
