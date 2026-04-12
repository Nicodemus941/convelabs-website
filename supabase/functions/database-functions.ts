
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0';

export const setupDatabaseFunctions = async (supabaseClient: any) => {
  // Create function to safely get scheduled campaigns
  await supabaseClient.rpc('create_get_scheduled_campaigns_function');
  
  // Create function to safely delete a scheduled campaign
  await supabaseClient.rpc('create_delete_scheduled_campaign_function');
};
