import React, { useEffect, useState, useRef } from 'react';
import { useBookingModal } from '@/contexts/BookingModalContext';
import { GHS_ORIGIN } from '@/lib/constants/urls';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

const IFRAME_SRC = 'https://greenhealthsystems.com/embed/convelabs';

export const BookingModal: React.FC = () => {
  const { isOpen, closeModal, source } = useBookingModal();
  const [isVisible, setIsVisible] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIframeLoaded(false);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.origin.includes(GHS_ORIGIN)) return;

      if (containerRef.current) {
        containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }

      if (e.data?.type === 'resize') {
        const iframe = document.getElementById('booking-iframe') as HTMLIFrameElement | null;
        if (iframe) {
          iframe.style.height = e.data.height + 'px';
        }
      }

      if (e.data?.type === 'bookingComplete') {
        console.log('Booking completed:', e.data.bookingId);
        toast.success('Appointment booked successfully!');
        closeModal();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) closeModal();
    };

    window.addEventListener('message', handleMessage);
    document.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, closeModal]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeModal();
  };

  const handleTransitionEnd = () => {
    if (!isOpen) setIsVisible(false);
  };

  if (!isVisible && !isOpen) return null;

  return (
    <div
      onClick={handleOverlayClick}
      onTransitionEnd={handleTransitionEnd}
      style={{
        display: 'flex',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.5)',
        zIndex: 10000,
        justifyContent: 'center',
        alignItems: isMobile ? 'stretch' : 'center',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: isMobile ? '100%' : '95%',
          maxWidth: isMobile ? 'none' : '900px',
          height: isMobile ? '100%' : '90vh',
          background: 'white',
          borderRadius: isMobile ? 0 : '12px',
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <button
          onClick={closeModal}
          aria-label="Close modal"
          style={{
            position: 'fixed',
            top: isMobile ? 'max(12px, env(safe-area-inset-top, 12px))' : undefined,
            right: isMobile ? '12px' : undefined,
            ...(isMobile ? {} : { position: 'sticky', top: '12px', float: 'right', marginRight: '12px' }),
            background: '#991B1B',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: isMobile ? '40px' : '36px',
            height: isMobile ? '40px' : '36px',
            fontSize: '20px',
            cursor: 'pointer',
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          &times;
        </button>

        {/* Loading skeleton */}
        {!iframeLoaded && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '16px',
            padding: '40px',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #B91C1C',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{ color: '#6b7280', fontSize: '14px', fontWeight: 500 }}>
              Loading booking form...
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        <iframe
          id="booking-iframe"
          src={IFRAME_SRC}
          onLoad={() => setIframeLoaded(true)}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: iframeLoaded ? 'block' : 'none',
          }}
          allow="payment"
          title="Book Appointment"
        />
      </div>
    </div>
  );
};
