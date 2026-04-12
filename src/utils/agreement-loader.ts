
import { seedMembershipAgreement } from "./agreement-utilities";

/**
 * Loads the membership agreement from the database or uses a fallback
 */
export const loadMembershipAgreement = async (): Promise<void> => {
  try {
    const success = await seedMembershipAgreement();
    if (success) {
      console.log('✅ Membership agreement available');
    } else {
      // This is not a critical error since we have the fallback in the modal
      console.log('⚠️ Could not seed membership agreement, will use fallback');
    }
  } catch (error) {
    console.error('Non-critical error with membership agreement:', error);
    console.log('ℹ️ Will use fallback text from constants');
  }
};
