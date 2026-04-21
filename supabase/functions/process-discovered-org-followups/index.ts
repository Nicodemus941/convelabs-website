/**
 * PROCESS-DISCOVERED-ORG-FOLLOWUPS
 *
 * Cron-driven (daily 9 AM ET). Finds discovered organizations that were
 * emailed 7+ days ago with no response yet, sends a short "just checking
 * in" follow-up, bumps followup_count. Caps at 2 follow-ups per org.
 *
 * Hormozi: the first email is the hook; the follow-up is where ~40% of
 * partnerships actually convert. Most owners never send follow-up emails
 * manually. A cron that does it for you captures that 40% for free.
 *
 * Respects quiet hours via shared gate. Writes to organizations:
 *   - followup_count += 1
 *   - last_followup_at = now()
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { shouldSendNow } from '../_shared/quiet-hours.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

function buildFollowupHtml(params: {
  physicianGreeting: string;
  practiceName: string;
  referralCount: number;
  followupSeq: number;
}): { subject: string; html: string } {
  const { physicianGreeting, practiceName, referralCount, followupSeq } = params;
  // Two different follow-up drafts — #1 is "just checking in", #2 is
  // value-dense (partnership ROI) before giving up.
  if (followupSeq === 1) {
    return {
      subject: `Following up — ConveLabs partnership for ${practiceName}`,
      html: `<p>Hi ${physicianGreeting},</p>
        <p>Following up on my note last week. A few more of your patients have used us for at-home draws recently (${referralCount} total so far).</p>
        <p>10-minute call Thursday or Friday? We can talk about a partnership rate that saves your patients \$40-50/visit and routes results straight to your EMR.</p>
        <p>If now isn't the right time, just reply "not now" and I'll check back in 90 days.</p>
        <p>— Nico Jean-Baptiste<br/>ConveLabs &middot; (941) 527-9169</p>
        <p style="font-size:11px;color:#888;margin-top:20px;">You can reply STOP to stop these emails.</p>`,
    };
  }
  return {
    subject: `Last note — ${practiceName} partnership`,
    html: `<p>Hi ${physicianGreeting},</p>
      <p>Last note from me — promise. Quick summary:</p>
      <ul>
        <li><strong>${referralCount} of your patients</strong> have already used ConveLabs for mobile draws</li>
        <li>Out-of-pocket cost to them: \$125-150 each</li>
        <li>Partner rate through your practice: \$85 each</li>
        <li>Same-day results routing to your EMR</li>
        <li>We handle insurance verification + specimen transport</li>
      </ul>
      <p>If you'd rather not hear from me again, reply "not interested" and I'll close the loop. Otherwise — Thursday 2 PM, Friday 10 AM, or pick a time: <a href="tel:+19415279169">(941) 527-9169</a>.</p>
      <p>— Nico<br/>ConveLabs</p>
      <p style="font-size:11px;color:#888;margin-top:20px;">You can reply STOP to stop these emails.</p>`,
  };
}

Deno.serve(async (_req) => {
  try {
    const gate = shouldSendNow('marketing');
    if (!gate.allow) {
      return new Response(JSON.stringify({ skipped: true, reason: gate.reason }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!MAILGUN_API_KEY) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no-mailgun-key' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: orgs, error } = await supabase.rpc('list_orgs_needing_followup' as any);
    if (error) throw error;

    const rows = (orgs as any[]) || [];
    let sent = 0, failed = 0;

    for (const org of rows) {
      try {
        const followupSeq = (org.followup_count || 0) + 1;
        const physicianGreeting = (() => {
          if (!org.ordering_physician) return `the team at ${org.name}`;
          const parts = String(org.ordering_physician).split(',');
          const last = parts[0]?.trim();
          return last ? `Dr. ${last}` : `the team at ${org.name}`;
        })();

        const { subject, html } = buildFollowupHtml({
          physicianGreeting,
          practiceName: org.name,
          referralCount: org.referral_count || 0,
          followupSeq,
        });

        const fd = new FormData();
        fd.append('from', `Nico @ ConveLabs <nico@${MAILGUN_DOMAIN}>`);
        fd.append('to', org.contact_email);
        fd.append('subject', subject);
        fd.append('html', html);
        fd.append('h:Reply-To', 'info@convelabs.com');
        fd.append('o:tracking-clicks', 'no');
        fd.append('o:tag', 'discovered-org-followup');

        const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: fd,
        });

        if (!mgRes.ok) {
          const t = await mgRes.text();
          console.error(`[org-followup] send failed for ${org.contact_email}:`, t);
          failed++;
          continue;
        }

        // Bump counters — don't touch outreach_status so admin still sees
        // the lead in the Discovered tab's 'emailed' state.
        await supabase.from('organizations').update({
          followup_count: followupSeq,
          last_followup_at: new Date().toISOString(),
        }).eq('id', org.id);

        sent++;
        console.log(`[org-followup] #${followupSeq} sent to ${org.contact_email} (${org.name})`);
      } catch (e: any) {
        console.error('[org-followup] row error:', e?.message || e);
        failed++;
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: rows.length, sent, failed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[org-followup] top-level:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
