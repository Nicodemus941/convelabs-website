
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0';

export const setupDatabaseFunctions = async (supabaseClient: any) => {
  // Create function to safely get scheduled campaigns
  try {
    await supabaseClient.rpc('create_get_scheduled_campaigns_function');
    console.log('Successfully set up get_scheduled_campaigns function');
  } catch (error) {
    console.error('Error setting up get_scheduled_campaigns function:', error);
  }
  
  // Create function to safely delete a scheduled campaign
  try {
    await supabaseClient.rpc('create_delete_scheduled_campaign_function');
    console.log('Successfully set up delete_scheduled_campaign function');
  } catch (error) {
    console.error('Error setting up delete_scheduled_campaign function:', error);
  }
};
