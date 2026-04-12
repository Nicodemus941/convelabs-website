import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, ArrowRight } from 'lucide-react';

interface BookingWidgetProps {
  className?: string;
  heading?: string;
  defaultService?: string;
}

const BookingWidgetInline: React.FC<BookingWidgetProps> = ({ 
  className = '', 
  heading = 'Book Your Mobile Blood Draw',
  defaultService = 'basic_blood_draw'
}) => {
  const navigate = useNavigate();
  const [zip, setZip] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = zip.trim();
    if (!/^\d{5}$/.test(trimmed)) {
      setError('Enter a valid 5-digit ZIP code');
      return;
    }
    navigate(`/book-now?zip=${trimmed}`);
  };

  return (
    <div className={`bg-background rounded-2xl border border-border p-5 sm:p-6 shadow-sm ${className}`}>
      <h3 className="text-lg font-bold text-foreground mb-3">{heading}</h3>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="Enter ZIP code"
            value={zip}
            onChange={e => { setZip(e.target.value.replace(/\D/g, '').slice(0, 5)); setError(''); }}
            className="pl-10 h-12 border-2 rounded-xl"
          />
        </div>
        <Button type="submit" className="h-12 px-6 bg-conve-red hover:bg-conve-red-dark text-white font-semibold rounded-xl min-h-[44px]">
          Check Availability <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </form>
      {error && <p className="text-destructive text-xs mt-2">{error}</p>}
      <p className="text-xs text-muted-foreground mt-3">In-office from $55 · Mobile from $150 · Same-day available · HIPAA Compliant</p>
    </div>
  );
};

export default BookingWidgetInline;
