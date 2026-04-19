// twilio-voice-greeting
// Inbound voice handler for the ConveLabs Twilio number. Plays a short
// greeting, forwards the call to Nico's cell. If the call fails to connect,
// tells the caller to email or text.
//
// Configure in Twilio Console → your number → Voice Configuration →
//   "A call comes in" → Webhook
//   URL:    https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/twilio-voice-greeting
//   HTTP:   POST

const OWNER_PHONE = Deno.env.get('CONVELABS_OWNER_PHONE') || '+19415279169';

function twiml(xml: string): Response {
  const doc = `<?xml version="1.0" encoding="UTF-8"?>${xml}`;
  return new Response(doc, { headers: { 'Content-Type': 'application/xml' } });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const stage = url.searchParams.get('stage') || 'initial';

    if (stage === 'initial') {
      // First leg: greet, then dial owner. action callback fires after Dial finishes.
      const actionUrl = `${url.origin}${url.pathname}?stage=afterdial`;
      return twiml(`<Response>
  <Say voice="Polly.Joanna">Thanks for calling ConveLabs. One moment while we connect you. Please note we handle most scheduling by text, so you can also reply to any of our messages.</Say>
  <Dial timeout="18" action="${actionUrl}" method="POST" callerId="${OWNER_PHONE}">${OWNER_PHONE}</Dial>
</Response>`);
    }

    // afterdial: if the dial didn't connect, point them to email/text
    return twiml(`<Response>
  <Say voice="Polly.Joanna">Sorry, we couldn't reach anyone live. Please email info at convelabs dot com, or text this number, and we'll get right back to you. Goodbye.</Say>
  <Hangup/>
</Response>`);
  } catch (error: any) {
    console.error('twilio-voice-greeting error:', error);
    return twiml(`<Response><Say voice="Polly.Joanna">We're having trouble with the phone system. Please email info at convelabs dot com or text this number. Goodbye.</Say><Hangup/></Response>`);
  }
});
