import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');

    const alerts: string[] = [];

    // 1. Check for failed webhooks in the last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: failedWebhooks } = await supabase
      .from('webhook_logs')
      .select('*')
      .eq('status', 'failed')
      .gte('created_at', twoHoursAgo);

    if (failedWebhooks && failedWebhooks.length > 0) {
      alerts.push(`${failedWebhooks.length} failed webhook(s) in last 2 hours`);
    }

    // 2. Check for stale slot holds (expired but not released)
    const { data: staleHolds } = await supabase
      .from('slot_holds')
      .select('*')
      .eq('released', false)
      .lt('expires_at', new Date().toISOString());

    if (staleHolds && staleHolds.length > 0) {
      // Auto-cleanup
      await supabase
        .from('slot_holds')
        .update({ released: true })
        .eq('released', false)
        .lt('expires_at', new Date().toISOString());
      console.log(`Cleaned up ${staleHolds.length} stale slot holds`);
    }

    // 3. Check for appointments with payment_status='pending' older than 24 hours (non-VIP)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: overdueInvoices } = await supabase
      .from('appointments')
      .select('id, patient_name, total_amount, created_at')
      .eq('payment_status', 'pending')
      .eq('is_vip', false)
      .lt('created_at', oneDayAgo)
      .in('status', ['scheduled', 'confirmed']);

    if (overdueInvoices && overdueInvoices.length > 0) {
      const names = overdueInvoices.map(a => a.patient_name || 'Unknown').join(', ');
      alerts.push(`${overdueInvoices.length} unpaid invoice(s) >24h: ${names}`);
    }

    // 4. Send alert SMS if any issues found
    if (alerts.length > 0 && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const message = `ConveLabs System Alert:\n\n${alerts.join('\n')}\n\nCheck dashboard for details.`;
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
      const body = new URLSearchParams({
        To: OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`,
        Body: message,
        ...(TWILIO_MESSAGING_SERVICE_SID
          ? { MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID }
          : { From: Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939' }),
      });

      await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
      console.log('Alert sent:', alerts);
    }

    return new Response(JSON.stringify({
      success: true,
      alerts: alerts.length,
      staleHoldsCleaned: staleHolds?.length || 0,
      details: alerts,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Stale payment check error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
