
import { seedMembershipAgreement } from './agreement-utilities';

/**
 * Seeds initial data into the database
 */
export const seedInitialData = async () => {
  try {
    // Seed membership agreement
    const agreementSeeded = await seedMembershipAgreement();
    
    if (agreementSeeded) {
      console.log('✅ Membership agreement seeded or already exists');
    } else {
      console.error('❌ Failed to seed membership agreement');
    }
    
    // Add other seeding functions here as needed
    
    return true;
  } catch (error) {
    console.error('Error seeding initial data:', error);
    return false;
  }
};

// Run seed function if this file is executed directly
if (typeof window !== 'undefined') {
  // This is a browser environment, do nothing
} else {
  // This is a Node.js environment, run the seed function
  seedInitialData()
    .then(() => console.log('Seeding completed'))
    .catch((error) => console.error('Seeding failed:', error));
}
