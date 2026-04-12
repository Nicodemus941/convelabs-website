
import React, { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { X, Loader2, User, LogOut, Settings, Phone, Calendar, DollarSign, MapPin, Info, Stethoscope, Star, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useBookingModalSafe } from '@/contexts/BookingModalContext';

interface MobileMenuProps {
  isMenuOpen: boolean;
  setIsMenuOpen: (isOpen: boolean) => void;
}

const MobileMenu = ({ isMenuOpen, setIsMenuOpen }: MobileMenuProps) => {
  const { user, logout, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const bookingModal = useBookingModalSafe();

  const handleSignOut = async () => {
    try {
      await logout();
      setIsMenuOpen(false);
      toast.success("You have been signed out");
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
      toast.error("Failed to sign out. Please try again.");
    }
  };

  const handleMenuItemClick = () => {
    setIsMenuOpen(false);
  };

  const handleBookAppointment = () => {
    bookingModal?.openModal('mobile_menu');
    setIsMenuOpen(false);
  };

  const getUserInitials = () => {
    if (!user) return "";
    return `${user.firstName?.charAt(0) || ""}${user.lastName?.charAt(0) || ""}`;
  };

  const isAdmin = user && ['admin', 'super_admin', 'office_manager'].includes(user.role);
  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMenuOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMenuOpen) setIsMenuOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isMenuOpen, setIsMenuOpen]);

  const navItems = [
    { name: "Services & Pricing", url: "/pricing", icon: DollarSign },
    { name: "Locations", url: "/#service-areas", icon: MapPin, isHash: true },
    { name: "About Us", url: "/about", icon: Info },
    { name: "Contact", url: "/contact", icon: Phone },
    { name: "For Doctors", url: "/b2b", icon: Stethoscope },
  ];

  return (
    <>
      <div className="lg:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="nav-toggle text-gray-700 hover:text-conve-red w-12 h-12 p-0 relative z-[10001]"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle navigation menu"
          aria-expanded={isMenuOpen}
        >
          <div className="hamburger-icon">
            <span className={`hamburger-line ${isMenuOpen ? 'active' : ''}`}></span>
            <span className={`hamburger-line ${isMenuOpen ? 'active' : ''}`}></span>
            <span className={`hamburger-line ${isMenuOpen ? 'active' : ''}`}></span>
          </div>
        </Button>
      </div>

      {isMenuOpen && (
        <div className="mobile-nav-overlay fixed inset-0 bg-black/50 z-[9999] lg:hidden animate-fade-in">
          <div className="mobile-nav-panel fixed top-0 right-0 h-full w-[90%] max-w-[380px] bg-white shadow-2xl overflow-y-auto animate-slide-in-right">

            {/* Header */}
            <div className="flex justify-between items-center p-5 border-b border-border">
              <div className="text-xl font-bold text-conve-red">ConveLabs</div>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="w-9 h-9 bg-muted hover:bg-conve-red hover:text-white rounded-full flex items-center justify-center transition-all"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">

              {/* Primary CTA — Book Appointment */}
              <button
                onClick={handleBookAppointment}
                className="w-full py-4 bg-conve-red text-white font-semibold rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center text-lg"
              >
                <Calendar className="h-5 w-5 mr-2" />
                Book Appointment
              </button>

              {/* User profile (if logged in) */}
              {user && (
                <div className="p-3 bg-muted/50 rounded-xl flex items-center gap-3">
                  <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                    <AvatarImage src="" alt={user?.email} />
                    <AvatarFallback className="bg-conve-red/10 text-conve-red font-medium text-sm">
                      {getUserInitials() || <User className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{user.firstName} {user.lastName}</div>
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="space-y-1">
                {navItems.map((item) => (
                  item.isHash ? (
                    <a
                      key={item.name}
                      href={item.url}
                      className="flex items-center p-3 rounded-xl text-foreground hover:bg-muted transition-all"
                      onClick={handleMenuItemClick}
                    >
                      <item.icon className="h-5 w-5 mr-3 text-muted-foreground" />
                      <span className="font-medium">{item.name}</span>
                    </a>
                  ) : (
                    <Link
                      key={item.name}
                      to={item.url}
                      className={`flex items-center p-3 rounded-xl transition-all ${
                        isActive(item.url) ? 'bg-red-50 text-conve-red font-semibold' : 'text-foreground hover:bg-muted'
                      }`}
                      onClick={handleMenuItemClick}
                    >
                      <item.icon className="h-5 w-5 mr-3 text-current opacity-60" />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  )
                ))}
              </div>

              {/* Membership highlight */}
              <Link
                to="/pricing"
                onClick={handleMenuItemClick}
                className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <Crown className="h-5 w-5 text-amber-600" />
                  <div>
                    <div className="font-semibold text-sm">Membership Plans</div>
                    <div className="text-xs text-muted-foreground">From $29/month</div>
                  </div>
                </div>
                <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-full">
                  Save 25%
                </span>
              </Link>

              {/* Phone */}
              <a
                href="tel:+19415279169"
                className="flex items-center justify-center gap-2 p-3 border-2 border-conve-red text-conve-red font-semibold rounded-xl hover:bg-red-50 transition-all"
              >
                <Phone className="h-4 w-4" />
                (941) 527-9169
              </a>

              {/* Auth section */}
              {isLoading ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span className="text-sm">Loading...</span>
                </div>
              ) : user ? (
                <div className="border-t pt-4 space-y-1">
                  <Link to="/dashboard" className="flex items-center p-3 rounded-xl text-foreground hover:bg-muted" onClick={handleMenuItemClick}>
                    <Settings className="h-5 w-5 mr-3 text-muted-foreground" />
                    <span className="font-medium">Dashboard</span>
                  </Link>
                  {isAdmin && (
                    <Link to="/dashboard/super_admin" className="flex items-center p-3 rounded-xl text-foreground hover:bg-muted" onClick={handleMenuItemClick}>
                      <Settings className="h-5 w-5 mr-3 text-muted-foreground" />
                      <span className="font-medium">Admin</span>
                    </Link>
                  )}
                  <button onClick={handleSignOut} className="flex items-center w-full p-3 rounded-xl text-foreground hover:bg-muted">
                    <LogOut className="h-5 w-5 mr-3 text-muted-foreground" />
                    <span className="font-medium">Sign Out</span>
                  </button>
                </div>
              ) : (
                <div className="border-t pt-4 flex gap-3">
                  <Link
                    to="/login"
                    className="flex-1 py-3 text-center text-foreground font-medium border rounded-xl hover:bg-muted transition-all"
                    onClick={handleMenuItemClick}
                  >
                    Login
                  </Link>
                  <Link
                    to="/signup"
                    className="flex-1 py-3 text-center bg-conve-red text-white font-semibold rounded-xl hover:bg-conve-red-dark transition-all"
                    onClick={handleMenuItemClick}
                  >
                    Sign Up
                  </Link>
                </div>
              )}

              {/* Social proof */}
              <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                <span>5.0 on Google</span>
                <span className="text-muted-foreground/40">·</span>
                <span>164 reviews</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileMenu;
