
// Re-export functions from the modules while avoiding naming conflicts
import * as checkoutSessions from './checkoutSessions';
import * as partnershipCheckout from './partnershipCheckout';
import * as corporateCheckout from './corporateCheckout';
export * from './formatUtils';
export * from './authentication';
export * from './labTests';
export * from './addOnCheckout';

// Export the functions explicitly to avoid interface name conflicts
export const { createCheckoutSession } = checkoutSessions;
export const { createPartnershipCheckout } = partnershipCheckout;
export const { createCorporateCheckout } = corporateCheckout;

// Re-export types with namespace to avoid conflicts
export type CheckoutSessionsTypes = typeof checkoutSessions;
export type PartnershipCheckoutTypes = typeof partnershipCheckout;
export type CorporateCheckoutTypes = typeof corporateCheckout;
