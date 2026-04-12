
import React, { useState, useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";

const UrgencyBanner = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setIsScrolled(scrollPosition > 200);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  if (!isVisible) return null;
  
  return (
    <div className={`${isScrolled ? 'fixed top-0 left-0 right-0 z-50 shadow-md' : 'relative'} bg-conve-red text-white py-2 transition-all duration-300`}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            <p className="text-sm font-medium">
              🚨 Now Accepting Appointments! Book Today — Membership Program Launches August 1st.
            </p>
          </div>
          <button 
            onClick={() => setIsVisible(false)}
            className="text-white hover:text-white/80 focus:outline-none"
            aria-label="Close banner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UrgencyBanner;
