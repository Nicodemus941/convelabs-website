
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import * as postgres from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

// This function sets up scheduled jobs to trigger our email functions
serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Connect to the database using the connection string
    const databaseUrl = Deno.env.get('SUPABASE_DB_URL')!;
    const pool = new postgres.Pool(databaseUrl, 3, true);
    
    // Get a connection from the pool
    const connection = await pool.connect();
    
    try {
      // Make sure the required extensions are enabled
      await connection.queryObject('CREATE EXTENSION IF NOT EXISTS pg_cron');
      await connection.queryObject('CREATE EXTENSION IF NOT EXISTS pg_net');
      
      // Get the Supabase project URL and anon key
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      
      // Schedule email reminders to run daily at 8 AM
      await connection.queryObject(`
        SELECT cron.schedule(
          'process-daily-emails',
          '0 8 * * *',
          $$
          SELECT
            net.http_post(
              url:='${supabaseUrl}/functions/v1/process-scheduled-emails',
              headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${supabaseAnonKey}"}'::jsonb,
              body:='{}'::jsonb
            ) as request_id;
          $$
        );
      `);
      
      // Schedule appointment reminders to run every hour
      await connection.queryObject(`
        SELECT cron.schedule(
          'process-appointment-reminders',
          '0 * * * *',
          $$
          SELECT
            net.http_post(
              url:='${supabaseUrl}/functions/v1/send-appointment-reminder',
              headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${supabaseAnonKey}"}'::jsonb,
              body:='{}'::jsonb
            ) as request_id;
          $$
        );
      `);
      
      // Schedule processing of scheduled campaigns to run every 15 minutes
      await connection.queryObject(`
        SELECT cron.schedule(
          'process-scheduled-campaigns',
          '*/15 * * * *',
          $$
          SELECT
            net.http_post(
              url:='${supabaseUrl}/functions/v1/process-scheduled-campaigns',
              headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${supabaseAnonKey}"}'::jsonb,
              body:='{}'::jsonb
            ) as request_id;
          $$
        );
      `);
      
      // Schedule invoice reminder processing every 15 minutes
      // Handles 3-stage escalation: gentle reminder (6h) → final warning (11h) → auto-cancel (12h)
      await connection.queryObject(`
        SELECT cron.schedule(
          'process-invoice-reminders',
          '*/15 * * * *',
          $$
          SELECT
            net.http_post(
              url:='${supabaseUrl}/functions/v1/process-invoice-reminders',
              headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${supabaseAnonKey}"}'::jsonb,
              body:='{}'::jsonb
            ) as request_id;
          $$
        );
      `);

      // Schedule stale payment check every 6 hours (owner alert, not patient-facing)
      await connection.queryObject(`
        SELECT cron.schedule(
          'check-stale-payments',
          '0 */6 * * *',
          $$
          SELECT
            net.http_post(
              url:='${supabaseUrl}/functions/v1/check-stale-payments',
              headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${supabaseAnonKey}"}'::jsonb,
              body:='{}'::jsonb
            ) as request_id;
          $$
        );
      `);

      // Return success response
      return new Response(
        JSON.stringify({
          success: true,
          message: "Scheduled email jobs have been set up successfully (including invoice reminders and stale payment checks)"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } finally {
      // Release the connection back to the pool
      connection.release();
    }
  } catch (error) {
    console.error('Error setting up email cron jobs:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
