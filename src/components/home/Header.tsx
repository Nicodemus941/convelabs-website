
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
        {/* Logo Section — blood-drop mark + editorial serif wordmark */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <svg viewBox="0 0 24 32" className="h-6 w-auto" aria-hidden="true">
            <path
              d="M12 1C12 1 3 12 3 20a9 9 0 0 0 18 0C21 12 12 1 12 1Z"
              fill="#B91C1C"
            />
          </svg>
          <span className="font-playfair text-2xl font-semibold tracking-tight text-conve-black">
            Conve<span className="text-conve-red">Labs</span>
          </span>
        </Link>

        {/* Mobile Menu Button */}
        <MobileMenu 
          isMenuOpen={isMenuOpen} 
          setIsMenuOpen={setIsMenuOpen} 
        />

        {/* Desktop Navigation */}
        <DesktopNavigation />

        {/* Header CTA Buttons — desktop: Membership + Book Now · tablet/mobile: Book Now only (Membership in hamburger) */}
        <div className="hidden lg:flex items-center space-x-3">
          <Link
            to="/pricing"
            className="px-4 py-2 text-sm font-medium tracking-wide text-conve-black/70 hover:text-conve-red transition-colors"
          >
            Membership
          </Link>
          <button
            onClick={() => bookingModal?.openModal('header_cta')}
            className="px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] bg-conve-red text-white rounded-lg hover:bg-conve-red-dark transition-colors shadow-luxury-red"
          >
            Book Now
          </button>
        </div>
        {/* Book Now always visible on tablet (md-lg) — primary revenue CTA */}
        <button
          onClick={() => bookingModal?.openModal('header_cta')}
          className="hidden md:flex lg:hidden px-4 py-2 text-sm font-semibold bg-conve-red text-white rounded-md hover:bg-red-700 transition-colors mr-2"
        >
          Book Now
        </button>

        {/* Auth Section */}
        <UserAuthSection />
      </div>
    </header>
  );
};

export default Header;
