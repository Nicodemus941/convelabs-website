import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ghs-signature, x-ghs-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPPORTED_EVENTS = [
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'booking.rescheduled',
  'booking.completed',
  'provider.assigned',
  'test.ping',
];

const EVENT_TO_STATUS: Record<string, string> = {
  'booking.created': 'scheduled',
  'booking.confirmed': 'confirmed',
  'booking.cancelled': 'canceled',
  'booking.rescheduled': 'rescheduled',
  'booking.completed': 'completed',
};

// --- Payload normalization helpers ---

function resolveEventType(payload: any): string | undefined {
  return payload.event_type || payload.type || payload.event;
}

function resolveEventId(payload: any): string | undefined {
  return payload.event_id || payload.id || payload.delivery_id;
}

function resolveBookingId(payload: any): string | undefined {
  return (
    payload.booking_id ||
    payload.data?.booking_id ||
    payload.data?.booking?.id
  );
}

// --- Signature verification ---

function stripSignaturePrefix(sig: string): string {
  // Accept both raw hex and "sha256=<hex>" formats
  if (sig.startsWith('sha256=')) {
    return sig.slice(7);
  }
  return sig;
}

async function verifySignature(body: string, signature: string, timestamp: string, secret: string): Promise<boolean> {
  const cleanSig = stripSignaturePrefix(signature);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`));
  const expectedSig = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (expectedSig.length !== cleanSig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    mismatch |= expectedSig.charCodeAt(i) ^ cleanSig.charCodeAt(i);
  }
  return mismatch === 0;
}

// --- Reusable event processor ---

async function processEvent(
  supabase: any,
  eventId: string,
  eventType: string,
  bookingId: string | null,
  data: any
): Promise<void> {
  if (bookingId) {
    if (eventType === 'provider.assigned' && data?.provider_name) {
      const { data: appointments } = await supabase
        .from('appointments')
        .select('id')
        .eq('external_booking_id', bookingId)
        .limit(1);

      if (appointments && appointments.length > 0) {
        await supabase
          .from('appointments')
          .update({ notes: `Provider assigned: ${data.provider_name}` })
          .eq('id', appointments[0].id);
      }
    } else if (EVENT_TO_STATUS[eventType]) {
      const updateData: any = { status: EVENT_TO_STATUS[eventType] };

      if (eventType === 'booking.rescheduled' && data?.new_date) {
        updateData.appointment_date = data.new_date;
        updateData.appointment_time = data.new_time || null;
        updateData.rescheduled_at = new Date().toISOString();
      }

      if (eventType === 'booking.cancelled') {
        updateData.cancelled_at = new Date().toISOString();
        updateData.cancellation_reason = data?.reason || 'Cancelled via GHS';
      }

      await supabase
        .from('appointments')
        .update(updateData)
        .eq('external_booking_id', bookingId);
    }
  }

  // Mark as processed
  await supabase
    .from('ghs_webhook_events')
    .update({ processed_status: 'processed', processed_at: new Date().toISOString() })
    .eq('event_id', eventId);
}

// --- Reprocess handler (admin-only) ---

async function handleReprocess(req: Request, supabase: any): Promise<Response> {
  // Verify admin JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    anonKey,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userRole = (claimsData.claims as any).user_metadata?.role;
  if (!['super_admin', 'admin', 'owner'].includes(userRole)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();
  const eventId = body.event_id;
  if (!eventId) {
    return new Response(JSON.stringify({ error: 'Missing event_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch stored event
  const { data: events, error: fetchErr } = await supabase
    .from('ghs_webhook_events')
    .select('*')
    .eq('event_id', eventId)
    .limit(1);

  if (fetchErr || !events || events.length === 0) {
    return new Response(JSON.stringify({ error: 'Event not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const storedEvent = events[0];
  const payload = storedEvent.payload_json;
  const eventType = resolveEventType(payload) || storedEvent.event_type;
  const bookingId = resolveBookingId(payload) || storedEvent.booking_id;

  // Increment retry count and set pending
  await supabase
    .from('ghs_webhook_events')
    .update({
      processed_status: 'pending',
      error_message: null,
      retry_count: (storedEvent.retry_count ?? 0) + 1,
    })
    .eq('event_id', eventId);

  try {
    await processEvent(supabase, eventId, eventType, bookingId, payload.data);
    return new Response(JSON.stringify({ status: 'reprocessed', event_id: eventId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Reprocess error:', err);
    await supabase
      .from('ghs_webhook_events')
      .update({
        processed_status: 'failed',
        error_message: err.message || 'Reprocess failed',
        processed_at: new Date().toISOString(),
      })
      .eq('event_id', eventId);
    return new Response(JSON.stringify({ error: 'Reprocess failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // --- Check for reprocess action (uses JSON body, not raw text) ---
  const contentType = req.headers.get('content-type') || '';
  const hasSignature = req.headers.has('x-ghs-signature');

  // If no GHS signature headers, this might be a reprocess request from admin UI
  if (!hasSignature && contentType.includes('application/json')) {
    const clonedReq = req.clone();
    try {
      const peek = await clonedReq.json();
      if (peek.action === 'reprocess') {
        return handleReprocess(req, supabase);
      }
    } catch {
      // Not valid JSON or not a reprocess request, fall through
    }
  }

  // --- Standard webhook path ---
  const webhookSecret = Deno.env.get('GHS_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('GHS_WEBHOOK_SECRET not configured');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const signature = req.headers.get('x-ghs-signature');
  const timestamp = req.headers.get('x-ghs-timestamp');

  if (!signature || !timestamp) {
    return new Response(JSON.stringify({ error: 'Missing signature headers' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Reject timestamps older than 5 minutes
  const tsSeconds = parseInt(timestamp, 10);
  if (isNaN(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
    return new Response(JSON.stringify({ error: 'Timestamp expired or invalid' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.text();

  const valid = await verifySignature(body, signature, timestamp, webhookSecret);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // --- Normalize fields ---
  const eventType = resolveEventType(payload);
  const eventId = resolveEventId(payload);
  const bookingId = resolveBookingId(payload) || null;
  const data = payload.data;

  // Handle test.ping immediately (before requiring event_id)
  if (eventType === 'test.ping') {
    return new Response(JSON.stringify({ status: 'ok', event_type: 'test.ping' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Validate required fields for non-ping events
  if (!eventType || !SUPPORTED_EVENTS.includes(eventType)) {
    // Log the failed attempt for observability
    if (eventId) {
      await supabase.from('ghs_webhook_events').insert({
        event_id: eventId,
        event_type: eventType || 'unknown',
        booking_id: bookingId,
        payload_json: payload,
        processed_status: 'failed',
        error_message: `Unsupported or missing event type: ${eventType}`,
        processed_at: new Date().toISOString(),
      });
    }
    return new Response(JSON.stringify({ error: `Unsupported event type: ${eventType}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!eventId) {
    // Generate a fallback ID so we can still log it
    const fallbackId = `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await supabase.from('ghs_webhook_events').insert({
      event_id: fallbackId,
      event_type: eventType,
      booking_id: bookingId,
      payload_json: payload,
      processed_status: 'failed',
      error_message: 'Missing event_id in payload',
      processed_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ error: 'Missing event_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Insert event record
  const { error: insertError } = await supabase.from('ghs_webhook_events').insert({
    event_id: eventId,
    event_type: eventType,
    booking_id: bookingId,
    payload_json: payload,
    processed_status: 'pending',
  });

  if (insertError) {
    // Duplicate event_id = already processed, return 200
    if (insertError.code === '23505') {
      return new Response(JSON.stringify({ status: 'already_processed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.error('Insert error:', insertError);
    return new Response(JSON.stringify({ error: 'Failed to store event' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Process event
  try {
    await processEvent(supabase, eventId, eventType, bookingId, data);
  } catch (processError: any) {
    console.error('Processing error:', processError);
    await supabase
      .from('ghs_webhook_events')
      .update({
        processed_status: 'failed',
        error_message: processError.message || 'Unknown processing error',
        processed_at: new Date().toISOString(),
      })
      .eq('event_id', eventId);

    return new Response(JSON.stringify({ error: 'Event processing failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ status: 'ok', event_id: eventId }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
