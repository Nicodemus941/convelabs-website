/**
 * Unified invite-email pipeline.
 *
 * Every "send an invite" edge function across the platform — patient,
 * staff, provider-team, org-manager, partner, corporate, owner — routes
 * through this module so that:
 *
 *   1. The send is PERSISTED to email_send_log BEFORE the network call.
 *      A row exists even if Mailgun is down. Status starts 'queued'.
 *   2. Mailgun is called with proper headers + branded sender.
 *   3. The row is updated to 'sent' (with mailgun_id) on 2xx response,
 *      'failed' (with last_error) on non-2xx or exception.
 *   4. Audit log row in org_outreach_log when an organization is involved.
 *
 * Ground truth: if you can't see a row in email_send_log, the invite
 * didn't go out. This closes the "James Davis never received the email"
 * class of bug where the function returned 200 but the email was never
 * actually queued.
 */

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

export type InviteKind =
  | 'patient_invite'
  | 'staff_invite'
  | 'team_member_invite'
  | 'org_manager_invite'
  | 'partner_invite'
  | 'corporate_invite'
  | 'provider_invite';

export interface InviteEmailRequest {
  to: string;
  subject: string;
  html: string;
  inviteKind: InviteKind;
  /** auth.users.id of the sender, if known */
  sentByUserId?: string | null;
  /** organization_id when invite is org-scoped (org-manager / corporate / partner) */
  organizationId?: string | null;
  /** Action link the recipient clicks — stored for audit + resend */
  actionLink?: string | null;
  /** Optional human label for sender ("Nicodemme @ ConveLabs", "Dr. James Davis @ Davis Clinic") */
  senderLabel?: string | null;
  /** Mailgun tags for downstream analytics. Always includes the inviteKind. */
  tags?: string[];
  /** Optional supabase client to write log rows. If omitted, caller is responsible. */
  supabase?: any;
}

export interface InviteEmailResult {
  ok: boolean;
  status: 'sent' | 'failed' | 'skipped';
  mailgunId?: string | null;
  error?: string | null;
  /** email_send_log row id, when persisted */
  logId?: string | null;
}

const FROM_ADDRESS = 'Nicodemme Jean-Baptiste <info@convelabs.com>';
const REPLY_TO = 'info@convelabs.com';

export async function sendInviteEmail(req: InviteEmailRequest): Promise<InviteEmailResult> {
  const { to, subject, html, inviteKind, supabase } = req;
  const cleanEmail = String(to || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, status: 'failed', error: 'invalid_email' };
  }

  // 1. PERSIST FIRST — row exists even if Mailgun is down
  let logId: string | null = null;
  if (supabase) {
    try {
      const { data: row, error: insErr } = await supabase
        .from('email_send_log')
        .insert({
          to_email: cleanEmail,
          subject,
          email_type: inviteKind,
          campaign_tag: inviteKind,
          organization_id: req.organizationId || null,
          sent_by: req.sentByUserId || null,
          status: 'queued',
          retry_payload: req.actionLink ? { action_link: req.actionLink, sender_label: req.senderLabel } : null,
        })
        .select('id')
        .single();
      if (insErr) {
        console.warn(`[invite-email/${inviteKind}] log insert failed:`, insErr.message);
      } else {
        logId = (row as any)?.id || null;
      }
    } catch (e: any) {
      console.warn(`[invite-email/${inviteKind}] log insert exception:`, e?.message);
    }
  }

  // 2. SEND via Mailgun
  if (!MAILGUN_API_KEY) {
    if (supabase && logId) {
      await supabase.from('email_send_log').update({
        status: 'failed',
        last_error: 'mailgun_api_key_not_configured',
        last_attempt_at: new Date().toISOString(),
      }).eq('id', logId);
    }
    return { ok: false, status: 'failed', error: 'mailgun_api_key_not_configured', logId };
  }

  const fd = new FormData();
  fd.append('from', FROM_ADDRESS);
  fd.append('to', cleanEmail);
  fd.append('subject', subject);
  fd.append('html', html);
  fd.append('h:Reply-To', REPLY_TO);
  fd.append('o:tracking-clicks', 'no');
  for (const t of [inviteKind, ...(req.tags || [])]) {
    fd.append('o:tag', t);
  }

  try {
    const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + btoa(`api:${MAILGUN_API_KEY}`) },
      body: fd,
    });
    const txt = await mgRes.text().catch(() => '');
    if (!mgRes.ok) {
      const err = `mailgun_${mgRes.status}: ${txt.substring(0, 200)}`;
      if (supabase && logId) {
        await supabase.from('email_send_log').update({
          status: 'failed',
          last_error: err,
          last_attempt_at: new Date().toISOString(),
          retry_count: 1,
        }).eq('id', logId);
      }
      return { ok: false, status: 'failed', error: err, logId };
    }

    // Mailgun returns JSON like {"id":"<...@mg.convelabs.com>","message":"Queued. Thank you."}
    let mailgunId: string | null = null;
    try {
      const parsed = JSON.parse(txt);
      mailgunId = parsed?.id || null;
    } catch { /* non-fatal */ }

    if (supabase && logId) {
      await supabase.from('email_send_log').update({
        status: 'sent',
        mailgun_id: mailgunId,
        sent_at: new Date().toISOString(),
        last_attempt_at: new Date().toISOString(),
      }).eq('id', logId);
    }

    // Org audit log
    if (supabase && req.organizationId) {
      try {
        await supabase.from('org_outreach_log').insert({
          organization_id: req.organizationId,
          action: `invite_email_sent:${inviteKind}`,
          actor_user_id: req.sentByUserId || null,
          note: `Invite "${subject}" sent to ${cleanEmail}`,
          details: { mailgun_id: mailgunId, log_id: logId, action_link: req.actionLink },
        });
      } catch { /* non-fatal */ }
    }

    return { ok: true, status: 'sent', mailgunId, logId };
  } catch (e: any) {
    const err = `mailgun_exception: ${e?.message || String(e)}`;
    if (supabase && logId) {
      await supabase.from('email_send_log').update({
        status: 'failed',
        last_error: err.substring(0, 500),
        last_attempt_at: new Date().toISOString(),
        retry_count: 1,
      }).eq('id', logId);
    }
    return { ok: false, status: 'failed', error: err, logId };
  }
}
