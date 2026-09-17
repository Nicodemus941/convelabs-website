
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
      
      // Clean up legacy reminder jobs first so the reschedule below is idempotent.
      await connection.queryObject(`
        SELECT cron.unschedule(jobname)
        FROM cron.job
        WHERE jobname IN (
          'process-daily-emails',
          'process-appointment-reminders',
          'appointment-reminders-night-before',
          'send-fasting-reminders-daily'
        );
      `);

      // Keep the legacy scheduled-email umbrella for non-patient traffic.
      // Patient-facing appointment reminders now self-gate inside their own
      // edge function so we do not depend on a static UTC hour.
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
      
      // Appointment reminders run every 15 minutes and self-gate to 8 AM ET
      // inside send-appointment-reminder. This keeps the delivery time fixed
      // across DST shifts and gives us retry redundancy if one tick fails.
      await connection.queryObject(`
        SELECT cron.schedule(
          'process-appointment-reminders',
          '*/15 * * * *',
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

      // Fasting reminders also run every 15 minutes and self-gate to 8 PM ET
      // inside send-fasting-reminders so winter/summer time changes do not
      // shift patient prep messages to 7 PM or 9 PM.
      await connection.queryObject(`
        SELECT cron.schedule(
          'send-fasting-reminders-daily',
          '*/15 * * * *',
          $$
          SELECT
            net.http_post(
              url:='${supabaseUrl}/functions/v1/send-fasting-reminders',
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
