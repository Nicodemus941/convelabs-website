
export interface Service {
  id: string;
  name: string;
  price: number;
  description: string;
}

// Services data
export const services: Service[] = [
  { id: "standard", name: "Standard Blood Draw", price: 175, description: "Home or Office Visit" },
  { id: "fasting", name: "Fasting or STAT Draw", price: 195, description: "Requires fasting or urgently needed" },
  { id: "specialty", name: "Specialty Kit Processing", price: 225, description: "Special collection kits or procedures" },
  { id: "therapeutic", name: "Therapeutic Phlebotomy", price: 275, description: "Therapeutic blood removal" },
];

// Add-ons data
export const addOns = [
  { id: "sameDay", name: "Same-Day Appointment", price: 50, description: "Book an appointment for the same day (subject to availability)" },
  { id: "weekend", name: "Weekend / After-Hours", price: 75, description: "Service outside regular hours (not available for à la carte bookings)" },
];

/**
 * Calculate the total price based on selected service and add-ons
 */
export const calculateTotalPrice = (
  selectedService: string | undefined, 
  sameDay: boolean | undefined, 
  weekend: boolean | undefined
): number => {
  let basePrice = 0;
  
  // Find the selected service
  const service = services.find(s => s.id === selectedService);
  if (service) {
    basePrice = service.price;
  }
  
  // Add prices for selected add-ons
  if (sameDay) basePrice += addOns[0].price;
  if (weekend) basePrice += addOns[1].price;
  
  return basePrice;
};
