
import React from 'react';
import { useFormContext } from 'react-hook-form';
import { ArrowLeft, ArrowRight, Home, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingFormValues } from '@/types/appointmentTypes';
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import AddressAutocomplete from '@/components/ui/address-autocomplete';
import { isZipServed, isZipExcluded } from '@/data/serviceZipCodes';
import { milesFromBase, SERVICE_RADIUS_MILES } from '@/lib/serviceArea';
import { AlertTriangle } from 'lucide-react';

interface LocationSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
}

const LocationSelectionStep: React.FC<LocationSelectionStepProps> = ({ 
  onNext, 
  onBack 
}) => {
  const { control, watch, setValue } = useFormContext<BookingFormValues>();
  const locationType = watch('locationDetails.locationType');

  // Service-area gate — we cover a fixed radius (SERVICE_RADIUS_MILES) around
  // the Orlando base. Out-of-area → soft gate (block the auto-booking, route
  // to a "request a visit" path) so we never silently take a paid booking we
  // can't fulfill (the April Inganna / Edgewater case).
  //   • Preferred: exact distance from the address autocomplete's coordinates.
  //   • Fallback (manual ZIP, no coords): the served-ZIP list.
  const zipRaw = watch('locationDetails.zipCode') || '';
  const zipDigits = (zipRaw.match(/\d{5}/) || [])[0];
  const lat = watch('locationDetails.lat');
  const lng = watch('locationDetails.lng');
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';
  const distanceMiles = hasCoords ? milesFromBase(lat as number, lng as number) : null;
  // Excluded ZIPs (e.g. Leesburg/Tavares/Groveland) are out even if within the
  // radius, so check exclusion first regardless of how the distance resolves.
  const outOfArea = (!!zipDigits && isZipExcluded(zipDigits))
    || (hasCoords
      ? (distanceMiles as number) > SERVICE_RADIUS_MILES
      : (!!zipDigits && !isZipServed(zipDigits)));

  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 md:p-6">
        <div className="space-y-5">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold">Service Location</h2>
            <p className="text-muted-foreground text-sm md:text-base mt-1">
              Where should our phlebotomist meet you?
            </p>
          </div>
          
          <div className="space-y-5">
            <div className="space-y-3">
              <label className="text-sm font-medium">Location Type</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant={locationType === 'home' ? "default" : "outline"}
                  className="flex-1 justify-start gap-2"
                  onClick={() => setValue('locationDetails.locationType', 'home')}
                >
                  <Home className="h-4 w-4" />
                  Home
                </Button>
                <Button
                  type="button"
                  variant={locationType === 'office' ? "default" : "outline"}
                  className="flex-1 justify-start gap-2"
                  onClick={() => setValue('locationDetails.locationType', 'office')}
                >
                  <Building className="h-4 w-4" />
                  Office/Workplace
                </Button>
              </div>
            </div>
            
            <div className="space-y-4 mt-2">
              <FormField
                control={control}
                name="locationDetails.address"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-2">
                    <label className="text-sm font-medium">Street Address</label>
                    <FormControl>
                      <AddressAutocomplete
                        value={field.value}
                        onChange={field.onChange}
                        onPlaceSelected={(place) => {
                          // Street-only since city/state/zip have their own form fields.
                          field.onChange(place.street || place.address);
                          if (place.city) setValue('locationDetails.city', place.city);
                          if (place.state) setValue('locationDetails.state', place.state);
                          if (place.zipCode) setValue('locationDetails.zipCode', place.zipCode);
                          // Capture coordinates for the exact service-radius check.
                          if (typeof place.lat === 'number' && typeof place.lng === 'number') {
                            setValue('locationDetails.lat', place.lat);
                            setValue('locationDetails.lng', place.lng);
                          }
                        }}
                        placeholder="Start typing your address..."
                      />
                    </FormControl>
                    {fieldState.error && (
                      <FormMessage>{fieldState.error.message}</FormMessage>
                    )}
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField
                  control={control}
                  name="locationDetails.city"
                  render={({ field, fieldState }) => (
                    <FormItem className="space-y-2">
                      <label className="text-sm font-medium">City</label>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Orlando" 
                        />
                      </FormControl>
                      {fieldState.error && (
                        <FormMessage>
                          {fieldState.error.message}
                        </FormMessage>
                      )}
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">State</label>
                    <Select
                      value={watch('locationDetails.state')}
                      onValueChange={(value) => setValue('locationDetails.state', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="FL" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FL">FL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <FormField
                    control={control}
                    name="locationDetails.zipCode"
                    render={({ field, fieldState }) => (
                      <FormItem className="space-y-2">
                        <label className="text-sm font-medium">ZIP</label>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="32801"
                            onChange={(e) => {
                              field.onChange(e);
                              // ZIP edited by hand → drop any stale coordinates
                              // from a previously-selected address so the gate
                              // re-evaluates against the new ZIP.
                              setValue('locationDetails.lat', undefined as any);
                              setValue('locationDetails.lng', undefined as any);
                            }}
                          />
                        </FormControl>
                        {fieldState.error && (
                          <FormMessage>
                            {fieldState.error.message}
                          </FormMessage>
                        )}
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <FormField
                  control={control}
                  name="locationDetails.aptUnit"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <label className="text-sm font-medium">Apt / Unit # <span className="text-muted-foreground font-normal">(Optional)</span></label>
                      <FormControl>
                        <Input {...field} placeholder="Apt 201, Suite B, etc." />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="locationDetails.gateCode"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <label className="text-sm font-medium">Gate Code <span className="text-muted-foreground font-normal">(Optional)</span></label>
                      <FormControl>
                        <Input {...field} placeholder="#1234, *5678, etc." />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-2 mt-2">
                <label className="text-sm font-medium">Special Instructions <span className="text-muted-foreground font-normal">(Optional)</span></label>
                <Textarea
                  {...control.register('locationDetails.instructions')}
                  placeholder="Parking instructions, building access notes, landmarks, etc."
                  className="resize-none"
                  rows={3}
                />
              </div>
            </div>
          </div>
          
          {/* Out-of-service-area soft gate */}
          {outOfArea && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900">
                  <p className="font-semibold">
                    That address is outside our {SERVICE_RADIUS_MILES}-mile service area
                    {distanceMiles != null ? ` (about ${Math.round(distanceMiles)} miles away)` : ` (ZIP ${zipDigits})`}.
                  </p>
                  <p className="mt-1 text-amber-800">
                    We may still be able to reach you — but we need to confirm before booking. Please request a visit and we'll get right back to you:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href="tel:+19415279169" className="inline-flex items-center rounded-md bg-[#B91C1C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#991B1B]">
                      Call (941) 527-9169
                    </a>
                    <a href={`mailto:info@convelabs.com?subject=Out-of-area%20visit%20request&body=I'd%20like%20to%20request%20a%20visit%20at%20ZIP%20${zipDigits}.`} className="inline-flex items-center rounded-md border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                      Email info@convelabs.com
                    </a>
                  </div>
                  <p className="mt-2 text-[11px] text-amber-700">Double-checked your ZIP? If it's wrong, fix it above to continue booking.</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-6 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <Button
              type="button"
              onClick={onNext}
              disabled={outOfArea}
              title={outOfArea ? 'This address is outside our service area' : undefined}
              className="flex items-center"
            >
              Review
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LocationSelectionStep;
