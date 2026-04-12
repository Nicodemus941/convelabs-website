
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0';

export const setupDatabaseFunctions = async (supabaseClient: any) => {
  // Create function to safely get scheduled campaigns
  await supabaseClient.sql`
    CREATE OR REPLACE FUNCTION get_scheduled_campaigns()
    RETURNS SETOF scheduled_campaigns
    LANGUAGE sql
    SECURITY DEFINER
    AS $$
      SELECT * FROM scheduled_campaigns ORDER BY scheduled_for ASC;
    $$;
  `;
  
  // Create function to safely delete a scheduled campaign
  await supabaseClient.sql`
    CREATE OR REPLACE FUNCTION delete_scheduled_campaign(campaign_id UUID)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      deleted_count integer;
    BEGIN
      DELETE FROM scheduled_campaigns 
      WHERE id = campaign_id 
      AND status = 'scheduled';
      
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      RETURN deleted_count > 0;
    END;
    $$;
  `;
};
