
import { useState, useEffect } from 'react';
import { useAvailability } from './useAvailability';
import { geocodeAddress, calculateDistance, getBufferTimeMinutes, GeoCoordinates } from '../services/geocodingService';
import { findAvailablePhlebotomist } from '../services/phlebotomistAssignmentService';
import { supabase } from '@/integrations/supabase/client';
import { format, addMinutes } from 'date-fns';
import { TimeSlot, AvailabilityDay } from '@/types/appointmentTypes';

export interface AddressDetails {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  locationType?: 'home' | 'office' | 'other';
  instructions?: string;
}

export function useAvailabilityWithDistance() {
  const baseAvailability = useAvailability();
  const [isLoading, setIsLoading] = useState(false);
  const [addressCoordinates, setAddressCoordinates] = useState<GeoCoordinates | null>(null);
  
  // Get availability considering distance constraints
  const getAvailabilityWithDistance = async (
    startDate: Date,
    numberOfDays: number = 14,
    locationDetails?: AddressDetails
  ): Promise<AvailabilityDay[]> => {
    setIsLoading(true);
    
    try {
      // Get the basic availability first
      const baseAvailabilityDays = await baseAvailability.getAvailabilityForDateRange(startDate, numberOfDays);
      
      // If no location details provided, return the base availability
      if (!locationDetails) {
        setIsLoading(false);
        return baseAvailabilityDays;
      }
      
      // Geocode the address
      const formattedAddress = `${locationDetails.address}, ${locationDetails.city}, ${locationDetails.state} ${locationDetails.zipCode}`;
      const coordinates = await geocodeAddress(formattedAddress, locationDetails.zipCode);
      
      // If geocoding failed, return the base availability
      if (!coordinates) {
        setIsLoading(false);
        return baseAvailabilityDays;
      }
      
      setAddressCoordinates(coordinates);
      
      // Get all scheduled appointments for the next few days
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + numberOfDays);
      
      const { data: scheduledAppointments } = await supabase
        .from('appointments')
        .select('*')
        .gt('appointment_date', startDate.toISOString())
        .lt('appointment_date', endDate.toISOString())
        .not('status', 'eq', 'cancelled')
        .order('appointment_date', { ascending: true });
      
      // Now adjust the availability based on distance constraints
      const updatedAvailabilityDays = await Promise.all(
        baseAvailabilityDays.map(async day => {
          // Skip days with no slots
          if (!day.available || day.slots.length === 0) {
            return day;
          }
          
          const updatedSlots = await Promise.all(
            day.slots.map(async slot => {
              // Skip unavailable slots
              if (!slot.available) {
                return slot;
              }
              
              // Parse the slot time using start property which we know exists
              // If time is not available, fallback to start
              const slotTimeStr = slot.time || slot.start;
              const [hour, minute, period] = slotTimeStr.match(/(\d+):(\d+)\s(AM|PM)/)?.slice(1) || [];
              if (!hour || !minute || !period) {
                return slot;
              }
              
              let hourNum = parseInt(hour);
              if (period === 'PM' && hourNum < 12) hourNum += 12;
              if (period === 'AM' && hourNum === 12) hourNum = 0;
              
              // Create a Date object for this slot
              const slotDate = new Date(typeof day.date === 'string' ? day.date : day.date.toISOString());
              slotDate.setHours(hourNum, parseInt(minute), 0, 0);
              
              // Check if a phlebotomist is available for this timeslot
              if (coordinates) {
                const availablePhlebotomist = await findAvailablePhlebotomist(
                  slotDate, 
                  coordinates, 
                  locationDetails.zipCode
                );
                
                return {
                  ...slot,
                  available: !!availablePhlebotomist
                };
              }
              
              return slot;
            })
          );
          
          return {
            ...day,
            slots: updatedSlots,
            available: updatedSlots.some(slot => slot.available)
          };
        })
      );
      
      setIsLoading(false);
      return updatedAvailabilityDays;
    } catch (error) {
      console.error('Error getting availability with distance:', error);
      setIsLoading(false);
      return [];
    }
  };
  
  // Estimate arrival window based on appointment time and distance
  const estimateArrivalWindow = async (
    appointmentTime: Date,
    locationDetails: AddressDetails
  ): Promise<{ start: Date; end: Date } | null> => {
    try {
      // Geocode the address if not already done
      if (!addressCoordinates) {
        const formattedAddress = `${locationDetails.address}, ${locationDetails.city}, ${locationDetails.state} ${locationDetails.zipCode}`;
        const coordinates = await geocodeAddress(formattedAddress, locationDetails.zipCode);
        
        if (!coordinates) {
          return null;
        }
        
        setAddressCoordinates(coordinates);
      }
      
      // Default 15-minute window if we don't have precise information
      const startWindow = new Date(appointmentTime);
      const endWindow = addMinutes(startWindow, 15);
      
      return { start: startWindow, end: endWindow };
    } catch (error) {
      console.error('Error estimating arrival window:', error);
      return null;
    }
  };

  return {
    ...baseAvailability,
    isLoading,
    getAvailabilityWithDistance,
    estimateArrivalWindow
  };
}
