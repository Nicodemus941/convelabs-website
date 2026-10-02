
// Twilio over its REST API with fetch — no SDK.
//
// This file used to `import { Twilio } from "https://esm.sh/twilio@4.18.1"`.
// esm.sh no longer serves a named `Twilio` export for that build, so every
// function importing this module died at boot ("does not provide an export
// named 'Twilio'"). It surfaced on 2026-10-02 when process-invoice-reminders
// and send-appointment-invoice started importing it via _shared/invoice-sms.ts
// and the */15 reminder cron returned 503. The other SMS senders already talk
// to the REST endpoint directly; this does the same, so nothing here can break
// at import time.

// Get Twilio credentials from environment variables
const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
// ConveLabs sends ONLY from its own number (407). The shared messaging service
// (TWILIO_MESSAGING_SERVICE_SID) was pooling both the ConveLabs and E-Labus
// numbers, so ConveLabs texts were leaving on the E-Labus 717 number. Pin to From.
const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

// Kept for importers that only check whether Twilio is configured.
export const twilio = accountSid && authToken ? { accountSid } : null;

// Function to send SMS via Twilio. Resolves with Twilio's message resource
// (has `sid`); throws with Twilio's error message/code on failure, e.g. 21610
// for a recipient who replied STOP.
export async function sendSMS(to: string, body: string): Promise<any> {
  if (!accountSid || !authToken) {
    throw new Error("Twilio is not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.");
  }

  if (!fromNumber) {
    throw new Error("ConveLabs sending number is not configured. Please set TWILIO_PHONE_NUMBER (the 407 ConveLabs number).");
  }

  const statusCallback = `${Deno.env.get('SUPABASE_URL') || ''}/functions/v1/twilio-status-callback`;
  const form = new URLSearchParams({ To: to, From: fromNumber, Body: body });
  // Twilio calls this back with the REAL carrier outcome (delivered /
  // undelivered / failed) so a silent bounce (e.g. A2P 30034) surfaces.
  if (statusCallback.startsWith('http')) form.set('StatusCallback', statusCallback);

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json?.message || `Twilio error ${res.status}`);
      err.code = json?.code;
      err.status = res.status;
      throw err;
    }
    return json;
  } catch (error) {
    console.error("Error sending SMS:", error);
    throw error;
  }
}

// Function to validate webhook requests from Twilio
export function validateTwilioRequest(request: Request): boolean {
  // In a production environment, implement proper validation
  // using the X-Twilio-Signature header and the Twilio SDK
  return true;
}
