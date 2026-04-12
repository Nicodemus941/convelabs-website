
import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import MobileMenu from "./navigation/MobileMenu";
import DesktopNavigation from "./navigation/DesktopNavigation";
import UserAuthSection from "./navigation/UserAuthSection";
import { ENROLLMENT_URL, withSource } from "@/lib/constants/urls";
import { useBookingModalSafe } from "@/contexts/BookingModalContext";

const Header = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const bookingModal = useBookingModalSafe();

  // Track scroll to add shadow when scrolled
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className={`bg-white py-4 sticky top-0 z-50 transition-shadow duration-300 ${isScrolled ? 'shadow-md' : 'shadow-sm'}`}>
      <div className="container mx-auto px-4 flex items-center justify-between">
        {/* Logo Section */}
        <Link to="/" className="text-2xl font-bold text-conve-red">
          ConveLabs
        </Link>

        {/* Mobile Menu Button */}
        <MobileMenu 
          isMenuOpen={isMenuOpen} 
          setIsMenuOpen={setIsMenuOpen} 
        />

        {/* Desktop Navigation */}
        <DesktopNavigation />

        {/* Header CTA Buttons - Desktop Only */}
        <div className="hidden lg:flex items-center space-x-3">
          <a
            href={withSource(ENROLLMENT_URL, 'header_membership')}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-conve-red transition-colors"
          >
            Membership
          </a>
          <button
            onClick={() => bookingModal?.openModal('header_cta')}
            className="px-5 py-2 text-sm font-semibold bg-conve-red text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Book Now
          </button>
        </div>

        {/* Auth Section */}
        <UserAuthSection />
      </div>
    </header>
  );
};

export default Header;
