
import React, { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Menu, X, Loader2, User, LogOut, Settings, Phone, Calendar, Home, DollarSign, HelpCircle, Info, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { AUTH_URL } from '@/lib/constants/urls';
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

  const handleCallNow = () => {
    window.location.href = "tel:+19415279169";
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
    { name: "Home", url: "/", icon: Home },
    { name: "How It Works", url: "/#how-it-works", icon: HelpCircle },
    { name: "Pricing", url: "/#pricing", icon: DollarSign },
    { name: "Service Areas", url: "/#service-areas", icon: MapPin },
    { name: "About", url: "/about", icon: Info },
    { name: "Contact", url: "/contact", icon: Phone },
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
            <div className="flex justify-between items-center p-6 bg-gradient-to-r from-red-50 to-white border-b border-border">
              <div className="text-2xl font-bold text-conve-red">ConveLabs</div>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="w-10 h-10 bg-red-100 hover:bg-conve-red hover:text-white rounded-full flex items-center justify-center text-conve-red transition-all duration-200"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              {/* User profile */}
              {user && (
                <div className="mb-6 p-4 bg-muted rounded-xl">
                  <div className="flex items-center space-x-3">
                    <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                      <AvatarImage src="" alt={user?.email} />
                      <AvatarFallback className="bg-conve-red/10 text-conve-red font-medium text-sm">
                        {getUserInitials() || <User className="h-5 w-5" />}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold text-foreground">{user.firstName} {user.lastName}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="space-y-1 mb-6">
                {navItems.map((item) => (
                  item.url.startsWith('/#') ? (
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

              {/* CTA */}
              <div className="space-y-3 p-5 bg-red-50 rounded-xl mb-6">
                <button
                  onClick={handleBookAppointment}
                  className="w-full py-4 bg-conve-red text-white font-semibold rounded-xl shadow-luxury-red active:scale-[0.98] transition-all flex items-center justify-center"
                >
                  <Calendar className="h-5 w-5 mr-2" />
                  Book Appointment
                </button>
                <button
                  onClick={handleCallNow}
                  className="w-full py-3 bg-white text-conve-red font-semibold border-2 border-conve-red rounded-xl active:scale-[0.98] transition-all flex items-center justify-center"
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Call: (941) 527-9169
                </button>
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-2 gap-2 mb-6">
                {["✓ HIPAA Compliant", "✓ CLIA Certified", "✓ Same-Day Available", "✓ 500+ Patients"].map((badge) => (
                  <div key={badge} className="p-2 bg-muted rounded-lg text-center text-xs font-semibold text-muted-foreground">
                    {badge}
                  </div>
                ))}
              </div>

              {/* User actions */}
              {isLoading ? (
                <div className="p-4 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span>Loading...</span>
                </div>
              ) : user ? (
                <div className="border-t border-border pt-4 space-y-1">
                  <Link to="/dashboard" className="flex items-center p-3 rounded-lg text-foreground hover:bg-muted" onClick={handleMenuItemClick}>
                    <Settings className="h-5 w-5 mr-3" />
                    <span>Dashboard</span>
                  </Link>
                  {isAdmin && (
                    <Link to="/dashboard/super_admin" className="flex items-center p-3 rounded-lg text-foreground hover:bg-muted" onClick={handleMenuItemClick}>
                      <Settings className="h-5 w-5 mr-3" />
                      <span>Admin</span>
                    </Link>
                  )}
                  <button onClick={handleSignOut} className="flex items-center w-full p-3 rounded-lg text-foreground hover:bg-muted">
                    <LogOut className="h-5 w-5 mr-3" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <div className="border-t border-border pt-4 space-y-3">
                  <a href={AUTH_URL} className="block w-full py-3 text-center text-foreground hover:bg-muted rounded-lg font-medium" onClick={handleMenuItemClick}>
                    Login
                  </a>
                  <a href={AUTH_URL} className="block w-full py-3 text-center bg-conve-red text-white rounded-lg font-semibold" onClick={handleMenuItemClick}>
                    Sign Up
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileMenu;
