import React, { createContext, useContext, useState } from 'react';
import { GHS_BOOKING_PAGE } from '@/lib/constants/urls';

interface BookingModalContextType {
  isOpen: boolean;
  openModal: (source?: string) => void;
  closeModal: () => void;
  source: string;
}

const BookingModalContext = createContext<BookingModalContextType | undefined>(undefined);

export const BookingModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [source, setSource] = useState('direct');
  const [isOpen, setIsOpen] = useState(false);

  const openModal = (src = 'direct') => {
    setSource(src);
    // Temporary: redirect to external GHS booking page while availability sync is fixed
    const url = src && src !== 'direct'
      ? `${GHS_BOOKING_PAGE}?utm_source=${encodeURIComponent(src)}`
      : GHS_BOOKING_PAGE;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const closeModal = () => {
    setIsOpen(false);
    document.body.style.overflow = '';
  };

  return (
    <BookingModalContext.Provider value={{ isOpen, openModal, closeModal, source }}>
      {children}
    </BookingModalContext.Provider>
  );
};

export const useBookingModal = () => {
  const context = useContext(BookingModalContext);
  if (!context) {
    throw new Error('useBookingModal must be used within BookingModalProvider');
  }
  return context;
};

export const useBookingModalSafe = () => {
  return useContext(BookingModalContext);
};
