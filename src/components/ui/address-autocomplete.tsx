import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin } from 'lucide-react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  onPlaceSelected?: (place: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    lat?: number;
    lng?: number;
  }) => void;
  placeholder?: string;
  className?: string;
}

const GOOGLE_MAPS_API_KEY = 'AIzaSyBOjIg3d5WPXtQKr-oMWelBMNXjddegQ98';

let scriptLoaded = false;
let scriptLoading = false;

function loadGoogleMapsScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (scriptLoaded) { clearInterval(check); resolve(); }
      }, 100);
    });
  }

  scriptLoading = true;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => { scriptLoaded = true; scriptLoading = false; resolve(); };
    script.onerror = () => { scriptLoading = false; reject(new Error('Failed to load Google Maps')); };
    document.head.appendChild(script);
  });
}

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onPlaceSelected,
  placeholder = 'Start typing your address...',
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadGoogleMapsScript().then(() => setLoaded(true)).catch(console.error);
  }, []);

  useEffect(() => {
    if (!loaded || !inputRef.current || autocompleteRef.current) return;

    const autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address', 'geometry'],
      types: ['address'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.address_components) return;

      let street = '';
      let city = '';
      let state = '';
      let zipCode = '';
      let lat: number | undefined;
      let lng: number | undefined;

      place.address_components.forEach((component: any) => {
        const types = component.types;
        if (types.includes('street_number')) street = component.long_name + ' ';
        if (types.includes('route')) street += component.long_name;
        if (types.includes('locality')) city = component.long_name;
        if (types.includes('administrative_area_level_1')) state = component.short_name;
        if (types.includes('postal_code')) zipCode = component.long_name;
      });

      if (place.geometry?.location) {
        lat = place.geometry.location.lat();
        lng = place.geometry.location.lng();
      }

      const formatted = place.formatted_address || `${street}, ${city}, ${state} ${zipCode}`;
      onChange(street || formatted);

      onPlaceSelected?.({
        address: street || formatted,
        city,
        state,
        zipCode,
        lat,
        lng,
      });
    });

    autocompleteRef.current = autocomplete;
  }, [loaded]);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`pl-9 ${className || ''}`}
        autoComplete="off"
      />
    </div>
  );
};

export default AddressAutocomplete;
