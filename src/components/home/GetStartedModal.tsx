import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Shield, FlaskConical, ArrowRight } from "lucide-react";
import { ENROLLMENT_URL, BOOKING_URL, TESTS_URL, withSource } from "@/lib/constants/urls";
import { useBookingModalSafe } from "@/contexts/BookingModalContext";

interface GetStartedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GetStartedModal: React.FC<GetStartedModalProps> = ({ isOpen, onClose }) => {
  const bookingModal = useBookingModalSafe();
  const options = [
    {
      icon: <Shield className="h-8 w-8" />,
      title: "Join as a Member",
      description: "For executives who demand structure and luxury • Priority access • Dedicated coordinator • Corporate group plans available",
      url: withSource(ENROLLMENT_URL, 'hero_modal'),
      highlight: true,
    },
    {
      icon: <Calendar className="h-8 w-8" />,
      title: "Book a Blood Draw",
      description: "Executive concierge booking • Travel-friendly scheduling • TRT monitoring • Corporate on-site services",
      url: withSource(BOOKING_URL, 'hero_modal'),
      bookingSource: 'hero_modal',
      highlight: false,
    },
    {
      icon: <FlaskConical className="h-8 w-8" />,
      title: "Browse Lab Tests",
      description: "Comprehensive executive panels • TRT & performance monitoring • Corporate wellness packages • Specialized testing",
      url: withSource(TESTS_URL, 'hero_modal'),
      highlight: false,
    },
  ];

  const handleOptionClick = (url: string, bookingSource?: string) => {
    if (bookingSource && bookingModal) {
      bookingModal.openModal(bookingSource);
    } else {
      window.location.href = url;
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-playfair font-bold text-center mb-2">
            How can we help you today?
          </DialogTitle>
          <p className="text-center text-gray-600">
            Choose the option that best fits your needs
          </p>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleOptionClick(option.url, option.bookingSource)}
              className={`group relative flex items-start gap-4 p-6 rounded-xl border-2 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg text-left ${
                option.highlight
                  ? 'border-conve-red bg-gradient-to-r from-red-50 to-white hover:border-conve-red/80'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className={`flex-shrink-0 p-3 rounded-lg ${
                option.highlight ? 'bg-conve-red text-white' : 'bg-gray-100 text-gray-700'
              } group-hover:scale-110 transition-transform duration-300`}>
                {option.icon}
              </div>
              
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {option.title}
                </h3>
                <p className="text-sm text-gray-600">
                  {option.description}
                </p>
              </div>
              
              <ArrowRight className="flex-shrink-0 h-5 w-5 text-gray-400 group-hover:text-conve-red group-hover:translate-x-1 transition-all duration-300" />
              
              {option.highlight && (
                <div className="absolute -top-2 -right-2 px-3 py-1 bg-conve-red text-white text-xs font-bold rounded-full shadow-lg">
                  BEST VALUE
                </div>
              )}
            </button>
          ))}
        </div>
        
        <div className="text-center text-xs text-gray-500 mt-2">
          All options redirect to our secure booking platform
        </div>
      </DialogContent>
    </Dialog>
  );
};
