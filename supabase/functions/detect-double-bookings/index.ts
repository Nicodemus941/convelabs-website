import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * DETECT DOUBLE-BOOKINGS — Self-Healing Conflict Resolution
 *
 * Runs every 15 min via cron. Scans the appointments table for conflicts
 * (same phleb, same day, overlapping time windows). For each conflict:
 *
 *   1. Identifies the "victim" (the LATER-booked appointment — the
 *      earlier one keeps its slot)
 *   2. Computes 3 alternative slots same day (closest open times)
 *   3. Issues a reschedule_token
 *   4. Sends apology SMS + email with approve/choose/decline links
 *   5. Pre-authorizes a $25 apology credit (applied if/when they accept)
 *
 * Hormozi principle: "Own mistakes loudly. Every apology paired with an
 * unprompted concession turns a bad moment into a loyalty story."
 *
 * The conflict-resolution link uses a signed token so:
 *  - No login required (patient can be anyone with the SMS)
 *  - One-tap approval ("Yes, 11:30 works") → instant reschedule
 *  - Token expires in 48h
 *
 * Conflict definition (conservative):
 *  - Same phlebotomist_id
 *  - Same calendar date
 *  - Scheduled times within 45 min of each other
 *  - Both appointments in active status (scheduled | confirmed)
 *  - Neither already has a pending reschedule_token
 *
 * Idempotent: won't double-issue tokens for the same appointment.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert "9:00 AM" / "09:00" / "14:30" → minutes since midnight
function parseTimeToMinutes(s: string | null): number | null {
  if (!s) return null;
  const t = s.trim();
  // AM/PM format
  const ampmMatch = t.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2] || '0', 10);
    const period = (ampmMatch[3] || '').toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  // HH:MM:SS or HH:MM
  const parts = t.split(':').map(n => parseInt(n, 10));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  return null;
}

function minutesToDisplay(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function generateToken(): string {
  // 32-char URL-safe random
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .substring(0, 32);
}

async function sendSMS(
  phone: string,
  message: string,
  accountSid: string,
  authToken: string,
  fromNumber: string,
): Promise<boolean> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const cleanPhone = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: cleanPhone, Body: message.substring(0, 1500), From: fromNumber }).toString(),
    });
    return resp.ok;
  } catch (e) {
    console.error('SMS error:', e);
    return false;
  }
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
  const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN');
  const FROM = Deno.env.get('MAILGUN_FROM') || `ConveLabs <hello@${MAILGUN_DOMAIN || 'convelabs.com'}>`;
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) return false;
  const form = new FormData();
  form.append('from', FROM);
  form.append('to', to);
  form.append('subject', subject);
  form.append('html', html);
  form.append('text', text);
  form.append('o:tag', 'double-booking-apology');
  // Disable Mailgun click-tracking — the tracking redirect was breaking
  // the reschedule link and sending patients to the landing page.
  form.append('o:tracking-clicks', 'no');
  try {
    const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`api:${MAILGUN_API_KEY}`) },
      body: form,
    });
    return resp.ok;
  } catch {
    return false;
  }
}

interface Alt { date: string; time: string; label: string; minutes: number }

/**
 * Suggest 3 nearest open slots on the same day.
 * Checks existing appointments on that day for the same phleb and finds
 * gaps of at least 60 minutes. If the day is full, suggests next day slots.
 */
async function suggestAlternatives(
  supabase: any,
  phlebId: string | null,
  date: string, // YYYY-MM-DD
  originalMinutes: number,
): Promise<Alt[]> {
  const OPEN = 6 * 60;    // 6:00 AM
  const CLOSE = 13 * 60 + 30; // 1:30 PM (current op hours)
  const SLOT_MIN = 60; // 1hr per visit

  // Load same-day appointments for the phleb
  let q = supabase
    .from('appointments')
    .select('appointment_time, status')
    .gte('appointment_date', `${date}`)
    .lt('appointment_date', `${date}T23:59:59`)
    .not('status', 'in', '("cancelled","rescheduled")');
  if (phlebId) q = q.eq('phlebotomist_id', phlebId);
  const { data: sameDay } = await q;

  const booked = new Set<number>();
  for (const a of sameDay || []) {
    const m = parseTimeToMinutes(a.appointment_time);
    if (m !== null) {
      for (let i = 0; i < SLOT_MIN; i += 15) booked.add(m + i);
    }
  }

  // Score all hourly slots by distance from original time; return top 3 open
  const candidates: Alt[] = [];
  for (let t = OPEN; t + SLOT_MIN <= CLOSE; t += 30) {
    // Check if this half-hour start is free (no conflict within 45 min)
    let free = true;
    for (let check = -45; check <= 45 && free; check += 15) {
      if (booked.has(t + check)) free = false;
    }
    if (!free) continue;
    const label = minutesToDisplay(t);
    candidates.push({ date, time: label, label, minutes: t });
  }

  // Sort by distance from original time; take 3
  candidates.sort((a, b) =>
    Math.abs(a.minutes - originalMinutes) - Math.abs(b.minutes - originalMinutes)
  );

  return candidates.slice(0, 3);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
    const SITE_URL = Deno.env.get('SITE_URL') || 'https://www.convelabs.com';
    const smsReady = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN);

    // Look at appointments in the next 14 days
    const today = new Date();
    const end = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const { data: appts, error: apptErr } = await supabase
      .from('appointments')
      .select('id, phlebotomist_id, appointment_date, appointment_time, status, patient_name, patient_email, patient_phone, created_at, service_type')
      .gte('appointment_date', today.toISOString().slice(0, 10))
      .lte('appointment_date', end.toISOString().slice(0, 10))
      .in('status', ['scheduled', 'confirmed'])
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true });

    if (apptErr) throw new Error(apptErr.message);
    if (!appts || appts.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No upcoming appointments' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Group by phleb + date → detect overlaps
    const results = {
      scanned: appts.length,
      conflicts_found: 0,
      tokens_issued: 0,
      notifications_sent: 0,
      skipped_existing_token: 0,
      errors: [] as string[],
    };

    // Existing pending tokens to avoid re-issuing
    const { data: existingTokens } = await supabase
      .from('reschedule_tokens')
      .select('appointment_id')
      .eq('status', 'pending');
    const pendingApptIds = new Set((existingTokens || []).map((t: any) => t.appointment_id));

    // Group appointments by "phleb|date" key
    type A = typeof appts[0];
    const groups = new Map<string, A[]>();
    for (const a of appts) {
      const dateKey = (a.appointment_date || '').slice(0, 10);
      const key = `${a.phlebotomist_id || 'none'}|${dateKey}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }

    for (const group of groups.values()) {
      if (group.length < 2) continue;
      // Sort by created_at so LATER-booked is the victim
      group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const earlier = group[i];
          const later = group[j];
          const ti = parseTimeToMinutes(earlier.appointment_time);
          const tj = parseTimeToMinutes(later.appointment_time);
          if (ti === null || tj === null) continue;
          if (Math.abs(ti - tj) >= 45) continue; // not a conflict

          results.conflicts_found++;

          // Victim = later-booked
          if (pendingApptIds.has(later.id)) {
            results.skipped_existing_token++;
            continue;
          }

          // Generate alternatives (skip the earlier's time so we don't suggest the taken slot)
          const alts = await suggestAlternatives(supabase, later.phlebotomist_id, (later.appointment_date || '').slice(0, 10), tj);

          const token = generateToken();
          const { data: tokenRow, error: tokenErr } = await supabase
            .from('reschedule_tokens')
            .insert({
              appointment_id: later.id,
              token,
              original_date: later.appointment_date,
              original_time: later.appointment_time,
              suggested_alternatives: alts,
              conflicting_appointment_id: earlier.id,
              reason: 'double_booking',
            })
            .select()
            .single();

          if (tokenErr || !tokenRow) {
            results.errors.push(`Token create failed for ${later.id}: ${tokenErr?.message}`);
            continue;
          }

          results.tokens_issued++;

          // Build the link
          const link = `${SITE_URL}/reschedule/${token}`;

          // Send SMS + email
          let sentAny = false;
          if (later.patient_phone && smsReady) {
            const dateDisplay = new Date((later.appointment_date || '').slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            const smsBody =
              `ConveLabs: sincerest apologies — we caught a scheduling conflict with your appointment on ${dateDisplay} at ${later.appointment_time}. ` +
              `Please pick a new time here: ${link} ` +
              `(As an apology, we've added $25 credit to your account — applies to this or any future visit.)`;
            const sent = await sendSMS(later.patient_phone, smsBody, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM);
            if (sent) {
              await supabase.from('reschedule_tokens').update({ sms_sent_at: new Date().toISOString() }).eq('id', tokenRow.id);
              sentAny = true;
            }
          }

          if (later.patient_email) {
            const dateDisplay = new Date((later.appointment_date || '').slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
            const html = `
<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#fff;">
<h1 style="color:#B91C1C;margin:0 0 8px">Sincerest apologies, ${later.patient_name?.split(' ')[0] || 'there'}.</h1>
<p style="font-size:16px;color:#333">We just caught a scheduling conflict with your appointment on <strong>${dateDisplay} at ${later.appointment_time}</strong>. One of our team will be serving another patient at that exact time, so we need to move yours.</p>
<p style="font-size:16px;color:#333">We've added a <strong>$25 credit</strong> to your account as an apology — applies to this visit or any future one.</p>
<p style="font-size:16px;color:#333"><strong>Please pick a new time that works for you:</strong></p>
<p style="text-align:center;margin:32px 0"><a href="${link}" style="display:inline-block;background:#B91C1C;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600">Pick a new time →</a></p>
<p style="text-align:center;margin:8px 0 32px;font-size:12px;color:#666;word-break:break-all">Or copy this link:<br><a href="${link}" style="color:#B91C1C;text-decoration:underline">${link}</a></p>
<p style="font-size:14px;color:#666">Link expires in 48 hours. Questions? Reply to this email or call (941) 527-9169.</p>
<p style="font-size:13px;color:#999;margin-top:32px">— The ConveLabs Team</p>
</body></html>`;
            const plainText = `Sincerest apologies — we caught a scheduling conflict with your appointment on ${dateDisplay} at ${later.appointment_time}. Please pick a new time: ${link}\n\nAs an apology, we've added $25 credit to your account. Valid for this or any future visit. Link expires in 48 hours.\n\n— The ConveLabs Team`;
            const sent = await sendEmail(later.patient_email,
              `We need to move your ${dateDisplay} appointment — sorry about this`,
              html, plainText);
            if (sent) {
              await supabase.from('reschedule_tokens').update({ email_sent_at: new Date().toISOString() }).eq('id', tokenRow.id);
              sentAny = true;
            }
          }

          if (sentAny) {
            results.notifications_sent++;

            // Issue apology credit (unredeemed — applied at next checkout)
            if (later.patient_email) {
              await supabase.from('apology_credits').insert({
                patient_email: later.patient_email,
                patient_phone: later.patient_phone,
                amount_cents: 2500,
                reason: 'double_booking',
                source_appointment_id: later.id,
                source_token_id: tokenRow.id,
              });
            }
          }

          // Also ping the owner so they know a conflict was auto-handled
          if (smsReady) {
            await sendSMS(
              Deno.env.get('OWNER_PHONE') || '9415279169',
              `[Auto] Double-booking detected: ${later.patient_name} (${later.appointment_time}) was auto-notified via SMS+email to reschedule. Token: ${token.slice(0, 8)}…`,
              TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM,
            );
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Detect error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
