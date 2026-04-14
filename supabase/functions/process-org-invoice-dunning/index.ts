// Automated dunning for organization (B2B) invoices.
// Runs daily via scheduled invocation (pg_cron or external scheduler).
// Escalates unpaid invoices at 7 / 14 / 30 days with increasing urgency.
//
// Dunning stages:
//   stage 0 → initial send (done by admin in OrganizationsTab)
//   stage 1 → friendly reminder at 7 days
//   stage 2 → second reminder at 14 days
//   stage 3 → final notice at 30 days
//
// After stage 3, the invoice is left in 'sent' status with dunning_stage=3
// and an admin alert is surfaced; no further automated follow-ups.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const DUNNING_TEMPLATES: Record<number, { subject: (inv: any, org: any) => string; body: (inv: any, org: any) => string }> = {
  1: {
    subject: (inv, org) => `Friendly reminder: ConveLabs invoice for ${org.name}`,
    body: (inv, org) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#B91C1C;color:white;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
          <h2 style="margin:0;">Quick Payment Reminder</h2>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
          <p>Hello ${org.contact_name || org.name},</p>
          <p>Just a friendly note that your invoice of <strong>$${Number(inv.amount).toFixed(2)}</strong>${inv.patient_name ? ` for ${inv.patient_name}` : ''} was sent about a week ago and is still open.</p>
          <p>If you've already sent payment, please disregard. Otherwise, we'd appreciate you squaring it away when you have a moment.</p>
          <p style="font-size:13px;color:#6b7280;">Questions? Reply to this email or call (941) 527-9169.</p>
          <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
        </div>
      </div>`,
  },
  2: {
    subject: (inv, org) => `Second reminder — ConveLabs invoice for ${org.name} ($${Number(inv.amount).toFixed(2)})`,
    body: (inv, org) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#D97706;color:white;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
          <h2 style="margin:0;">Second Reminder</h2>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
          <p>Hello ${org.contact_name || org.name},</p>
          <p>Your invoice of <strong>$${Number(inv.amount).toFixed(2)}</strong>${inv.patient_name ? ` for ${inv.patient_name}` : ''} is now <strong>14 days past</strong> the send date.</p>
          <p>Please take a moment to process payment so we can keep your account in good standing.</p>
          <p style="font-size:13px;color:#6b7280;">If there's an issue with this invoice or you'd like to set up a payment plan, reply to this email or call (941) 527-9169.</p>
          <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
        </div>
      </div>`,
  },
  3: {
    subject: (inv, org) => `FINAL NOTICE — Invoice for ${org.name} 30 days past due`,
    body: (inv, org) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#991B1B;color:white;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
          <h2 style="margin:0;">Final Notice — 30 Days Past Due</h2>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
          <p>Hello ${org.contact_name || org.name},</p>
          <p>Your invoice of <strong>$${Number(inv.amount).toFixed(2)}</strong>${inv.patient_name ? ` for ${inv.patient_name}` : ''} is now <strong>30 days past due</strong>.</p>
          <p>To avoid service interruption, please remit payment within 7 days or contact our team to set up a payment plan.</p>
          <p style="font-size:13px;color:#6b7280;">Reply to this email or call (941) 527-9169 immediately.</p>
          <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
        </div>
      </div>`,
  },
};

const STAGE_DAYS: Record<number, number> = { 1: 7, 2: 14, 3: 30 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

    if (!MAILGUN_API_KEY) {
      return new Response(JSON.stringify({ error: 'Mailgun not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = Date.now();
    let sent = 0;
    const log: any[] = [];

    // Pull all sent, unpaid, non-paused invoices along with their org
    const { data: invoices, error } = await supabase
      .from('org_invoices' as any)
      .select('*, organizations:org_id(id,name,contact_name,billing_email,contact_email)')
      .eq('status', 'sent')
      .eq('dunning_paused', false)
      .not('sent_at', 'is', null);

    if (error) throw error;

    for (const inv of (invoices || []) as any[]) {
      const org = inv.organizations;
      const recipient = org?.billing_email || org?.contact_email;
      if (!recipient) {
        log.push({ invoice: inv.id, skipped: 'no email' });
        continue;
      }

      const ageDays = Math.floor((now - new Date(inv.sent_at).getTime()) / (1000 * 60 * 60 * 24));
      const currentStage = inv.dunning_stage || 0;

      // Figure out the next stage to fire (if any)
      let nextStage = 0;
      if (currentStage < 3 && ageDays >= STAGE_DAYS[3]) nextStage = 3;
      else if (currentStage < 2 && ageDays >= STAGE_DAYS[2]) nextStage = 2;
      else if (currentStage < 1 && ageDays >= STAGE_DAYS[1]) nextStage = 1;

      if (!nextStage) {
        log.push({ invoice: inv.id, age: ageDays, stage: currentStage, action: 'none' });
        continue;
      }

      const template = DUNNING_TEMPLATES[nextStage];
      const formData = new FormData();
      formData.append('from', 'ConveLabs Billing <billing@mg.convelabs.com>');
      formData.append('to', recipient);
      formData.append('subject', template.subject(inv, org));
      formData.append('html', template.body(inv, org));

      const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: formData,
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.error(`Dunning email failed for invoice ${inv.id}: ${errText}`);
        log.push({ invoice: inv.id, stage: nextStage, error: errText.slice(0, 200) });
        continue;
      }

      await supabase.from('org_invoices' as any).update({
        dunning_stage: nextStage,
        last_dunning_at: new Date().toISOString(),
      }).eq('id', inv.id);

      sent++;
      log.push({ invoice: inv.id, org: org?.name, to: recipient, stage: nextStage, age_days: ageDays });
    }

    console.log(`Org invoice dunning complete: ${sent} emails sent across ${(invoices || []).length} candidates`);

    return new Response(
      JSON.stringify({ success: true, sent, total_candidates: (invoices || []).length, log }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Dunning error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
