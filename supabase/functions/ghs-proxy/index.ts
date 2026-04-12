import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';

const GHS_API_KEY = Deno.env.get('GHS_API_KEY') || '';
const GHS_API_URL = Deno.env.get('GHS_API_URL') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';

type Action = 'coverage' | 'availability' | 'book' | 'status' | 'booking-hold' | 'checkout-session' | 'checkout-status' | 'services' | 'business_profile' | 'office_hours' | 'scheduling_config' | 'service_catalog' | 'provider_details' | 'provider_schedule';

const VALID_ACTIONS: Action[] = ['coverage', 'availability', 'book', 'status', 'booking-hold', 'checkout-session', 'checkout-status', 'services', 'business_profile', 'office_hours', 'scheduling_config', 'service_catalog', 'provider_details', 'provider_schedule'];

interface ProxyRequest {
  action: Action;
  data?: Record<string, unknown>;
  bookingId?: string;
  sessionId?: string;
}

// Generate time slots from a schedule block
function generateSlotsFromSchedule(
  date: string,
  startTime: string,
  endTime: string,
  phlebotomistId: string,
  phlebotomistName: string,
  bookedSlots: { start_time: string; end_time: string }[],
  slotDuration: number = 60
) {
  const slots: any[] = [];
  const bufferTime = 15; // minutes

  // Parse start/end times
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  let currentMinutes = startMinutes;

  while (currentMinutes + slotDuration <= endMinutes) {
    const slotStart = `${String(Math.floor(currentMinutes / 60)).padStart(2, '0')}:${String(currentMinutes % 60).padStart(2, '0')}`;
    const slotEndMin = currentMinutes + slotDuration;
    const slotEnd = `${String(Math.floor(slotEndMin / 60)).padStart(2, '0')}:${String(slotEndMin % 60).padStart(2, '0')}`;

    // Check if this slot conflicts with any booked appointment
    const isBooked = bookedSlots.some(booked => {
      const [bsH, bsM] = booked.start_time.split(':').map(Number);
      const [beH, beM] = booked.end_time.split(':').map(Number);
      const bookedStart = bsH * 60 + bsM;
      const bookedEnd = beH * 60 + beM;
      // Conflict if slot overlaps with booked (including buffer)
      return currentMinutes < (bookedEnd + bufferTime) && slotEndMin > (bookedStart - bufferTime);
    });

    if (!isBooked) {
      // Format for display
      const startHour = Math.floor(currentMinutes / 60);
      const startMin = currentMinutes % 60;
      const ampm = startHour >= 12 ? 'PM' : 'AM';
      const displayHour = startHour > 12 ? startHour - 12 : (startHour === 0 ? 12 : startHour);
      const displayTime = `${displayHour}:${String(startMin).padStart(2, '0')} ${ampm}`;

      const endHour = Math.floor(slotEndMin / 60);
      const endMin = slotEndMin % 60;
      const endAmpm = endHour >= 12 ? 'PM' : 'AM';
      const displayEndHour = endHour > 12 ? endHour - 12 : (endHour === 0 ? 12 : endHour);
      const displayEndTime = `${displayEndHour}:${String(endMin).padStart(2, '0')} ${endAmpm}`;

      slots.push({
        id: `${date}-${slotStart}-${phlebotomistId}`,
        date,
        startTime: displayTime,
        endTime: displayEndTime,
        arrivalWindow: `${displayTime} - ${displayEndTime}`,
        providerId: phlebotomistId,
        providerName: phlebotomistName,
      });
    }

    currentMinutes += slotDuration + bufferTime;
  }

  return slots;
}

// ─── In-memory cache for GHS config calls (5-minute TTL) ──────
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const configCache: {
  businessHours?: CacheEntry<Record<number, { start: string; end: string } | null>>;
  schedulingConfig?: CacheEntry<{ slotDuration: number; bufferMinutes: number; sameDayAllowed: boolean }>;
} = {};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Business hours configuration (Eastern Time)
// Default hardcoded hours — overridden by GHS office_hours API when available
const DEFAULT_BUSINESS_HOURS: Record<number, { start: string; end: string } | null> = {
  0: null, // Sunday — closed
  1: { start: '06:00', end: '13:30' },
  2: { start: '06:00', end: '13:30' },
  3: { start: '06:00', end: '13:30' },
  4: { start: '06:00', end: '13:30' },
  5: { start: '06:00', end: '13:30' },
  6: { start: '06:00', end: '09:45' },
};

function getBusinessHours(dayOfWeek: number, dynamicHours?: Record<number, { start: string; end: string } | null>): { start: string; end: string } | null {
  const source = dynamicHours || DEFAULT_BUSINESS_HOURS;
  return source[dayOfWeek] ?? null;
}

// Fetch dynamic business hours from GHS office_hours API (with 5-min cache)
async function fetchDynamicBusinessHours(): Promise<Record<number, { start: string; end: string } | null> | null> {
  if (configCache.businessHours && Date.now() < configCache.businessHours.expiresAt) {
    console.log('[GHS] Using cached business hours');
    return configCache.businessHours.data;
  }
  if (!GHS_API_KEY || !GHS_API_URL) return null;
  try {
    const res = await fetch(GHS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GHS_API_KEY}`,
        'X-Client-Source': 'convelabs-web',
      },
      body: JSON.stringify({ action: 'office_hours' }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const hoursData = json?.data?.hours || json?.hours || json?.data || null;
    if (!hoursData) return null;

    // Map day names or indices to our 0-6 format
    const dayNameMap: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
      sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
    };

    const result: Record<number, { start: string; end: string } | null> = {};

    if (Array.isArray(hoursData)) {
      for (const entry of hoursData) {
        const dayNum = typeof entry.day === 'number'
          ? entry.day
          : dayNameMap[String(entry.day || entry.day_of_week || entry.name || '').toLowerCase()] ?? -1;
        if (dayNum < 0 || dayNum > 6) continue;
        if (entry.closed || entry.is_closed || !entry.open_time) {
          result[dayNum] = null;
        } else {
          result[dayNum] = {
            start: normalizeTimeToHHMM(entry.open_time || entry.start || entry.start_time) || '06:00',
            end: normalizeTimeToHHMM(entry.close_time || entry.end || entry.end_time) || '13:30',
          };
        }
      }
    } else if (typeof hoursData === 'object') {
      for (const [key, value] of Object.entries(hoursData)) {
        const dayNum = typeof key === 'string' ? (dayNameMap[key.toLowerCase()] ?? parseInt(key)) : parseInt(key);
        if (isNaN(dayNum) || dayNum < 0 || dayNum > 6) continue;
        const v = value as any;
        if (v === null || v?.closed || v?.is_closed) {
          result[dayNum] = null;
        } else {
          result[dayNum] = {
            start: normalizeTimeToHHMM(v?.open_time || v?.start || v?.start_time) || '06:00',
            end: normalizeTimeToHHMM(v?.close_time || v?.end || v?.end_time) || '13:30',
          };
        }
      }
    }

    // Only return if we got at least one valid day
    if (Object.keys(result).length > 0) {
      configCache.businessHours = { data: result, expiresAt: Date.now() + CACHE_TTL_MS };
      return result;
    }
    return null;
  } catch (e) {
    console.log(`[GHS] Failed to fetch office_hours: ${(e as Error).message}`);
    return null;
  }
}

// Fetch scheduling config from GHS (with 5-min cache)
async function fetchSchedulingConfig(): Promise<{ slotDuration: number; bufferMinutes: number; sameDayAllowed: boolean } | null> {
  if (configCache.schedulingConfig && Date.now() < configCache.schedulingConfig.expiresAt) {
    console.log('[GHS] Using cached scheduling config');
    return configCache.schedulingConfig.data;
  }
  if (!GHS_API_KEY || !GHS_API_URL) return null;
  try {
    const res = await fetch(GHS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GHS_API_KEY}`,
        'X-Client-Source': 'convelabs-web',
      },
      body: JSON.stringify({ action: 'scheduling_config' }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const cfg = json?.data || json;
    const configResult = {
      slotDuration: Number(cfg?.service_duration_minutes || cfg?.slot_duration_minutes || cfg?.appointment_duration || 60),
      bufferMinutes: Number(cfg?.buffer_minutes || cfg?.travel_buffer_minutes || cfg?.slot_interval_minutes || 15),
      sameDayAllowed: Boolean(cfg?.same_day_allowed ?? cfg?.allow_same_day ?? false),
    };
    configCache.schedulingConfig = { data: configResult, expiresAt: Date.now() + CACHE_TTL_MS };
    return configResult;
  } catch (e) {
    console.log(`[GHS] Failed to fetch scheduling_config: ${(e as Error).message}`);
    return null;
  }
}

// Get current time in Eastern timezone
function nowEastern(): Date {
  const utc = new Date();
  // Build an Eastern time string and parse it
  const eastern = new Date(utc.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return eastern;
}

// Get today's date string in Eastern timezone (YYYY-MM-DD)
function todayEasternStr(): string {
  const et = nowEastern();
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
}

// Fetch booked appointments from GHS API to prevent double-booking
// Tries multiple calendar/appointments action variants because downstream naming is inconsistent
function normalizeTimeToHHMM(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '';
  const value = raw.trim();

  // ISO datetime: YYYY-MM-DDTHH:mm:ss...
  if (value.includes('T')) {
    const timePart = value.split('T')[1] || '';
    return timePart.substring(0, 5);
  }

  // 12-hour format: h:mm AM/PM
  const ampmMatch = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]);
    const min = Number(ampmMatch[2]);
    const period = ampmMatch[3].toUpperCase();
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  // 24-hour format: HH:mm or HH:mm:ss
  const hhmmMatch = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmmMatch) {
    return `${String(Number(hhmmMatch[1])).padStart(2, '0')}:${hhmmMatch[2]}`;
  }

  return '';
}

function extractDateAndTime(rawDateTime: unknown, fallbackDate = ''): { date: string; time: string } {
  if (!rawDateTime || typeof rawDateTime !== 'string') {
    return { date: fallbackDate, time: '' };
  }

  const value = rawDateTime.trim();
  if (value.includes('T')) {
    const [datePart] = value.split('T');
    return { date: datePart || fallbackDate, time: normalizeTimeToHHMM(value) };
  }

  return { date: fallbackDate, time: normalizeTimeToHHMM(value) };
}

function parseGHSBookingEntries(payload: any): { start_time: string; end_time: string; date: string }[] {
  const entries: { start_time: string; end_time: string; date: string }[] = [];

  const pushEntry = (raw: any) => {
    const rawDate = raw?.date || raw?.appointment_date || raw?.scheduled_date || raw?.day || '';
    const startExtracted = extractDateAndTime(raw?.start_time || raw?.appointment_time || raw?.time || raw?.scheduled_at, rawDate);
    const endExtracted = extractDateAndTime(raw?.end_time || raw?.end_at, startExtracted.date || rawDate);

    const date = startExtracted.date || endExtracted.date || rawDate;
    const startTime = startExtracted.time;
    const duration = Number(raw?.duration_minutes || raw?.duration || raw?.total_duration_minutes || 60);
    const endTime = endExtracted.time || (startTime ? addMinutes(startTime, duration > 0 ? duration : 60) : '');

    if (date && startTime) {
      entries.push({
        date,
        start_time: startTime,
        end_time: endTime || addMinutes(startTime, 60),
      });
    }
  };

  const collectArray = (candidate: any) => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) pushEntry(item);
      return;
    }

    // Some APIs return object keyed by date/provider
    if (candidate && typeof candidate === 'object') {
      for (const value of Object.values(candidate)) {
        if (Array.isArray(value)) {
          for (const item of value) pushEntry(item);
        }
      }
    }
  };

  const buckets = [
    payload,
    payload?.data,
    payload?.calendar,
    payload?.data?.calendar,
    payload?.data?.provider_calendar,
  ];

  for (const bucket of buckets) {
    if (!bucket) continue;

    collectArray(bucket?.booked_slots);
    collectArray(bucket?.active_holds);
    collectArray(bucket?.holds);
    collectArray(bucket?.appointments);
    collectArray(bucket?.slots);
    collectArray(bucket?.booked);
    collectArray(bucket?.blocked_slots);
    collectArray(bucket?.events);
    // If bucket itself is an array, parse it too
    collectArray(bucket);
  }

  // Deduplicate
  const dedup = new Map<string, { start_time: string; end_time: string; date: string }>();
  for (const entry of entries) {
    dedup.set(`${entry.date}-${entry.start_time}-${entry.end_time}`, entry);
  }

  return Array.from(dedup.values());
}

function isLikelyUnavailableStatus(rawStatus: unknown): boolean {
  if (!rawStatus) return false;
  const status = String(rawStatus).toLowerCase();
  return [
    'booked',
    'unavailable',
    'blocked',
    'held',
    'reserved',
    'busy',
    'taken',
    'closed',
    'full',
    'expired',
    'cancelled',
  ].some((term) => status.includes(term));
}

function isGhsSlotBookable(slot: any): boolean {
  if (!slot || typeof slot !== 'object') return false;

  // Explicit booleans from upstream
  if (slot.available === false || slot.is_available === false) return false;
  if (slot.booked === true || slot.is_booked === true) return false;
  if (slot.blocked === true || slot.is_blocked === true) return false;
  if (slot.held === true || slot.is_held === true) return false;

  // Status-like fields
  if (isLikelyUnavailableStatus(slot.status)) return false;
  if (isLikelyUnavailableStatus(slot.slot_status)) return false;
  if (isLikelyUnavailableStatus(slot.availability_status)) return false;

  // Capacity-style fields
  const remaining = Number(slot.remaining_slots ?? slot.remaining ?? slot.open_slots ?? slot.available_count ?? slot.capacity_remaining);
  if (Number.isFinite(remaining) && remaining <= 0) return false;

  // Label/badge hints
  const labels = Array.isArray(slot.labels) ? slot.labels : [];
  if (labels.some((label: unknown) => isLikelyUnavailableStatus(label))) return false;

  // Must have a valid start time to be usable
  const start = new Date(slot.start_time || slot.start || slot.starts_at || '');
  if (Number.isNaN(start.getTime())) return false;

  return true;
}

async function fetchGHSBookedAppointments(dateFrom: string, dateTo: string, providerId?: string): Promise<{ start_time: string; end_time: string; date: string }[]> {
  if (!GHS_API_KEY || !GHS_API_URL) return [];

  let rateLimited = false;

  const requestGHS = async (body: Record<string, unknown>) => {
    if (rateLimited) return { response: { ok: false, status: 429 } as Response, text: '{"error":"skipped - rate limited"}', json: { error: 'skipped - rate limited' } };

    const response = await fetch(GHS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GHS_API_KEY}`,
        'X-Client-Source': 'convelabs-web',
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}

    // If we get rate limited, stop making further calls
    if (response.status === 429) {
      rateLimited = true;
      console.log(`[GHS-Sync] Rate limited — stopping further API calls`);
    }

    return { response, text, json };
  };

  try {
    console.log(`[GHS-Sync] Fetching GHS bookings from ${dateFrom} to ${dateTo} (provider: ${providerId || 'all'})`);

    // Strategy: minimal calls. Try only the most likely endpoints.

    // 1. If we have a provider ID, try get_provider_calendar (single call)
    if (providerId) {
      const { response, text, json } = await requestGHS({
        action: 'get_provider_calendar',
        provider_id: providerId,
        start_date: dateFrom,
        end_date: dateTo,
        include_holds: true,
        include_bookings: true,
      });
      console.log(`[GHS-Sync] get_provider_calendar(${providerId}) status: ${response.status}, body: ${text.substring(0, 300)}`);

      if (response.ok) {
        const parsed = parseGHSBookingEntries(json);
        if (parsed.length > 0) {
          console.log(`[GHS-Sync] get_provider_calendar returned ${parsed.length} booked/held entries`);
          return parsed;
        }
      }
    }

    // 2. Try get_appointments with date range (NO status filter — 'scheduled' is rejected by GHS)
    if (!rateLimited) {
      const { response, text, json } = await requestGHS({
        action: 'get_appointments',
        start_date: dateFrom,
        end_date: dateTo,
        ...(providerId ? { provider_id: providerId } : {}),
      });
      console.log(`[GHS-Sync] get_appointments(range, no status) status: ${response.status}, body: ${text.substring(0, 300)}`);

      const needsSingleDate = json?.error?.includes('date is required');

      if (response.ok) {
        const parsed = parseGHSBookingEntries(json);
        if (parsed.length > 0) {
          console.log(`[GHS-Sync] get_appointments(range) returned ${parsed.length} appointments`);
          return parsed;
        }
      }

      // 3. If range isn't supported, try per-day — but only for dates that matter
      if (needsSingleDate && !rateLimited) {
        const allDateResults: { start_time: string; end_time: string; date: string }[] = [];
        const from = new Date(`${dateFrom}T00:00:00Z`);
        const to = new Date(`${dateTo}T00:00:00Z`);

        for (let cursor = new Date(from); cursor <= to && !rateLimited; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
          const day = cursor.toISOString().split('T')[0];
          const { response: dayRes, text: dayText, json: dayJson } = await requestGHS({
            action: 'get_appointments',
            date: day,
            ...(providerId ? { provider_id: providerId } : {}),
          });
          console.log(`[GHS-Sync] get_appointments(${day}) status: ${dayRes.status}, body: ${dayText.substring(0, 200)}`);

          if (dayRes.ok) {
            const dailyParsed = parseGHSBookingEntries(dayJson);
            if (dailyParsed.length > 0) allDateResults.push(...dailyParsed);
          }
        }

        if (allDateResults.length > 0) {
          const dedup = new Map<string, { start_time: string; end_time: string; date: string }>();
          for (const entry of allDateResults) dedup.set(`${entry.date}-${entry.start_time}-${entry.end_time}`, entry);
          const merged = Array.from(dedup.values());
          console.log(`[GHS-Sync] Per-day queries returned ${merged.length} appointments`);
          return merged;
        }
      }
    }

    console.log('[GHS-Sync] No booked appointments returned from GHS');
    return [];
  } catch (e) {
    console.log(`[GHS-Sync] Failed to fetch GHS bookings: ${(e as Error).message}`);
    return [];
  }
}


// Query local Supabase for availability using appointments + business hours
async function getLocalAvailability(zipCode: string, requestedDate: string, daysToSearch: number = 7, serviceDuration: number = 60) {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log(`[Availability] Querying local DB for ZIP: ${zipCode}, from: ${requestedDate}, days: ${daysToSearch}`);

  const fromDate = new Date(requestedDate + 'T00:00:00');
  const toDate = new Date(fromDate);
  toDate.setDate(toDate.getDate() + daysToSearch);
  const toDateStr = toDate.toISOString().split('T')[0];

  // Step 1: Get all active phlebotomists (must have a linked user_id)
  const { data: staffProfiles, error: spError } = await supabaseAdmin
    .from('staff_profiles')
    .select('id, specialty, user_id, tenant_id')
    .eq('specialty', 'phlebotomist')
    .not('user_id', 'is', null);

  console.log(`[Availability] Active phlebotomists: ${staffProfiles?.length || 0}`, spError ? `Error: ${spError.message}` : '');

  if (!staffProfiles || staffProfiles.length === 0) {
    return { slots: [], nextAvailableDate: null, _hasGhsData: false, _hasLocalBookings: false };
  }

  const phlebotomistIds = staffProfiles.map(sp => sp.id);

  // Step 2: Check phlebotomist_schedules first
  const { data: schedules } = await supabaseAdmin
    .from('phlebotomist_schedules')
    .select('*')
    .in('phlebotomist_id', phlebotomistIds)
    .eq('is_available', true)
    .gte('date', requestedDate)
    .lte('date', toDateStr)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  const hasExplicitSchedules = schedules && schedules.length > 0;
  console.log(`[Availability] Explicit schedules found: ${schedules?.length || 0}`);

  // Step 3: Get ALL booked appointments in the range (this is our source of truth)
  const { data: bookedAppointments } = await supabaseAdmin
    .from('appointments')
    .select('id, phlebotomist_id, appointment_date, appointment_time, duration_minutes, status, service_type')
    .in('phlebotomist_id', phlebotomistIds)
    .not('status', 'in', '("cancelled","completed","expired")')
    .gte('appointment_date', requestedDate)
    .lte('appointment_date', toDateStr);

  console.log(`[Availability] Booked appointments in range: ${bookedAppointments?.length || 0}`);

  // Also get booked appointment_slots
  const { data: bookedSlots } = await supabaseAdmin
    .from('appointment_slots')
    .select('phlebotomist_id, date, start_time, end_time')
    .in('phlebotomist_id', phlebotomistIds)
    .eq('is_booked', true)
    .gte('date', requestedDate)
    .lte('date', toDateStr);

  console.log(`[Availability] Booked slots in range: ${bookedSlots?.length || 0}`);

  // Step 3b: Also fetch booked appointments from GHS to prevent double-booking
  const ghsBookings = await fetchGHSBookedAppointments(requestedDate, toDateStr);
  console.log(`[Availability] GHS external bookings: ${ghsBookings.length}`);

  const hasLocalBookings = ((bookedAppointments?.length || 0) + (bookedSlots?.length || 0)) > 0;
  const hasGhsData = ghsBookings.length > 0;

  // Step 4: Build provider name map
  const nameMap: Record<string, string> = {};
  staffProfiles.forEach(sp => {
    nameMap[sp.id] = 'Nico';
  });

  // Step 5: If explicit schedules exist, use them (original logic)
  if (hasExplicitSchedules) {
    console.log('[Availability] Using explicit phlebotomist_schedules');
    const scheduleResult = generateFromSchedules(schedules!, bookedAppointments || [], bookedSlots || [], nameMap, requestedDate, toDateStr, serviceDuration, ghsBookings);
    return { ...scheduleResult, _hasGhsData: hasGhsData, _hasLocalBookings: hasLocalBookings };
  }

  // Step 6: No explicit schedules — infer availability from business hours + booked appointments
  console.log('[Availability] No explicit schedules — inferring from business hours + appointments');

  // Determine which providers are actively working by looking at their appointments
  // Also include all providers since they should be available during business hours
  const allSlots: any[] = [];

  for (let dayOffset = 0; dayOffset < daysToSearch; dayOffset++) {
    const date = new Date(fromDate);
    date.setDate(date.getDate() + dayOffset);
    const dayOfWeek = date.getDay();
    const dateStr = date.toISOString().split('T')[0];

    const hours = getBusinessHours(dayOfWeek);
    if (!hours) continue; // Skip Sunday

    // Skip dates in the past (before current time)
    const now = nowEastern();
    const isToday = dateStr === todayEasternStr();

    // For each provider, calculate open slots
    for (const provider of staffProfiles) {
      // Gather all booked times for this provider on this date
      // Includes: local DB appointments, local DB slots, AND GHS external bookings
      // Apply ALL bookings to ALL providers — single-provider org means any booking blocks everyone
      const providerBookings = [
        ...(bookedAppointments?.filter(
          ba => ba.appointment_date === dateStr
        ) || []).map(ba => ({
          start_time: ba.appointment_time || '00:00',
          end_time: addMinutes(ba.appointment_time || '00:00', ba.duration_minutes || 60),
        })),
        ...(bookedSlots?.filter(
          bs => bs.date === dateStr
        ) || []).map(bs => ({
          start_time: bs.start_time,
          end_time: bs.end_time,
        })),
        ...ghsBookings.filter(gb => gb.date === dateStr).map(gb => ({
          start_time: gb.start_time,
          end_time: gb.end_time,
        })),
      ];

      // Determine effective start time (skip past times if today)
      let effectiveStart = hours.start;
      if (isToday) {
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = hours.start.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        // Round up to next 15-minute interval + buffer
        const nextSlotStart = Math.ceil((nowMinutes + 30) / 15) * 15;
        if (nextSlotStart > startMinutes) {
          effectiveStart = `${String(Math.floor(nextSlotStart / 60)).padStart(2, '0')}:${String(nextSlotStart % 60).padStart(2, '0')}`;
        }
        // If we're past business hours entirely, skip
        const [endH, endM] = hours.end.split(':').map(Number);
        if (nextSlotStart >= endH * 60 + endM) continue;
      }

      const slots = generateSlotsFromSchedule(
        dateStr,
        effectiveStart,
        hours.end,
        provider.id,
        nameMap[provider.id] || 'Licensed Phlebotomist',
        providerBookings,
        serviceDuration
      );

      allSlots.push(...slots);
    }
  }

  // Deduplicate slots by time (if multiple providers have same time, just show one)
  const uniqueSlots = deduplicateSlots(allSlots);

  // Tag first slot
  if (uniqueSlots.length > 0) {
    uniqueSlots[0].tag = 'soonest';
  }

  console.log(`[Availability] Total available slots: ${uniqueSlots.length} (from ${allSlots.length} raw)`);
  return { slots: uniqueSlots, nextAvailableDate: null, _hasGhsData: hasGhsData, _hasLocalBookings: hasLocalBookings };
}

// Deduplicate slots — keep one per time window, prefer different providers for variety
function deduplicateSlots(slots: any[]): any[] {
  const seen = new Map<string, any>();
  for (const slot of slots) {
    const key = `${slot.date}-${slot.startTime}`;
    if (!seen.has(key)) {
      seen.set(key, slot);
    }
  }
  return Array.from(seen.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.startTime < b.startTime ? -1 : 1;
  });
}

// Generate slots from explicit phlebotomist_schedules (original working logic)
function generateFromSchedules(
  schedules: any[],
  bookedAppointments: any[],
  bookedSlots: any[],
  nameMap: Record<string, string>,
  fromDate: string,
  toDate: string,
  serviceDuration: number = 60,
  ghsBookings: { start_time: string; end_time: string; date: string }[] = []
) {
  const allSlots: any[] = [];

  for (const schedule of schedules) {
    // Apply ALL bookings to block this schedule — single-provider org
    const phlebBookedSlots = [
      ...(bookedSlots.filter(bs => bs.date === schedule.date)).map(bs => ({
        start_time: bs.start_time,
        end_time: bs.end_time,
      })),
      ...(bookedAppointments.filter(ba => ba.appointment_date === schedule.date)).map(ba => ({
        start_time: ba.appointment_time || '00:00',
        end_time: addMinutes(ba.appointment_time || '00:00', ba.duration_minutes || 60),
      })),
      // GHS external bookings for this date
      ...ghsBookings.filter(gb => gb.date === schedule.date).map(gb => ({
        start_time: gb.start_time,
        end_time: gb.end_time,
      })),
    ];

    const providerName = nameMap[schedule.phlebotomist_id] || 'Licensed Phlebotomist';
    const slots = generateSlotsFromSchedule(
      schedule.date,
      schedule.start_time,
      schedule.end_time,
      schedule.phlebotomist_id,
      providerName,
      phlebBookedSlots,
      serviceDuration
    );
    allSlots.push(...slots);
  }

  if (allSlots.length > 0) {
    allSlots[0].tag = 'soonest';
  }

  console.log(`[Availability] Total slots from explicit schedules: ${allSlots.length}`);
  return { slots: allSlots, nextAvailableDate: null };
}

// Helper to add minutes to a time string
function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const totalMin = h * 60 + m + minutes;
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
}

// Slots with active holds or completed payment should not be shown as available
async function getUnavailableSlotIds(fromDate: string, toDate: string): Promise<Set<string>> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return new Set();

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabaseAdmin
    .from('booking_holds')
    .select('slot_id, status, expires_at, created_at')
    .in('status', ['held', 'converted'])
    .gte('created_at', `${fromDate}T00:00:00.000Z`)
    .lte('created_at', `${toDate}T23:59:59.999Z`);

  if (error || !data) {
    console.warn(`[Availability] Could not fetch booking holds for slot filtering: ${error?.message || 'unknown error'}`);
    return new Set();
  }

  const now = new Date();
  const blocked = data.filter((hold) => {
    if (hold.status === 'converted') return true;
    if (hold.status === 'held' && hold.expires_at) return new Date(hold.expires_at) > now;
    return false;
  });

  return new Set(blocked.map((hold) => hold.slot_id));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: ProxyRequest = await req.json();
    const { action, data, bookingId, sessionId } = body;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle services catalog
    if (action === 'services') {
      // Try GHS service_catalog first, then get-services, then local fallback
      if (GHS_API_KEY && GHS_API_URL) {
        // Try new service_catalog action first
        try {
          const catalogRes = await fetch(GHS_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${GHS_API_KEY}`,
              'X-Client-Source': 'convelabs-web',
            },
            body: JSON.stringify({ action: 'service_catalog', include_addons: true, tenant: 'convelabs' }),
          });
          const catalogData = await catalogRes.json();
          if (catalogRes.ok && !catalogData?.error?.includes('Unknown action') && (catalogData?.services || catalogData?.data?.services)) {
            console.log('[Services] Resolved via GHS service_catalog action');
            const resolved = catalogData?.services ? catalogData : catalogData?.data;
            return new Response(JSON.stringify(resolved), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } catch (e) {
          console.log(`[Services] service_catalog not available: ${(e as Error).message}`);
        }

        // Fallback: try legacy get-services action
        try {
          const ghsResponse = await fetch(GHS_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${GHS_API_KEY}`,
              'X-Client-Source': 'convelabs-web',
            },
            body: JSON.stringify({ action: 'get-services', tenant: 'convelabs' }),
          });
          const responseData = await ghsResponse.json();
          if (ghsResponse.ok && !responseData?.error?.includes('Unknown action')) {
            console.log('[Services] Resolved via GHS get-services action');
            return new Response(JSON.stringify(responseData), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } catch (e) {
          console.log('GHS services endpoint not available, using local catalog');
        }
      }

      // Local ConveLabs service catalog
      const localCatalog = {
        services: [
          {
            id: 'at_home_blood_draw',
            public_name: 'Mobile Blood Draw (At Home)',
            short_description: 'A licensed phlebotomist comes to your home or office for a standard blood draw. Bring your own lab order or we can help you get one.',
            starting_price: 150,
            duration_minutes: 60,
            badge_text: 'Most Popular',
            icon: 'droplet',
            is_featured: true,
            same_day_available: true,
            display_order: 1,
            requires_manual_review: false,
            is_partner: false,
          },
          {
            id: 'senior_blood_draw',
            public_name: 'Senior Blood Draw (65+)',
            short_description: 'Specially priced mobile blood draw for patients 65 and older. Same quality service at a reduced rate.',
            starting_price: 100,
            duration_minutes: 60,
            icon: 'heart',
            display_order: 2,
            requires_manual_review: false,
            is_partner: false,
          },
          {
            id: 'doctor_office_blood_draw',
            public_name: 'Doctor Office Blood Draw',
            short_description: 'Blood draw performed at your doctor\'s office by our licensed phlebotomist.',
            starting_price: 55,
            duration_minutes: 60,
            icon: 'stethoscope',
            display_order: 3,
            requires_manual_review: false,
            is_partner: false,
          },
          {
            id: 'therapeutic_phlebotomy',
            public_name: 'Therapeutic Phlebotomy',
            short_description: 'Therapeutic blood removal as directed by your physician. Requires a doctor\'s order.',
            starting_price: 225,
            duration_minutes: 90,
            icon: 'syringe',
            display_order: 4,
            requires_manual_review: false,
            is_partner: false,
            same_day_available: true,
          },
          {
            id: 'specialty_collection',
            public_name: 'Specialty Collection Kit',
            short_description: 'Timed draws, glucose tolerance, or specialty tube collections. Includes kit handling.',
            starting_price: 200,
            duration_minutes: 90,
            icon: 'flask',
            display_order: 5,
            requires_manual_review: false,
            is_partner: false,
          },
        ],
        addOns: [
          { id: 'additional_patient', name: 'Additional Patient', description: 'Add another patient at the same visit', price: 75, icon: 'user-plus', duration_minutes: 20 },
          { id: 'respiratory_swab', name: 'Respiratory Swab', description: 'COVID / Flu / RSV rapid test swab', price: 40, icon: 'thermometer', duration_minutes: 10 },
        ],
        partnerServices: [
          {
            id: 'elite_medical',
            public_name: 'Elite Medical Patients',
            short_description: 'Exclusive partner pricing for Elite Medical patients. Mobile blood draw service.',
            starting_price: 72,
            duration_minutes: 60,
            icon: 'heart',
            display_order: 1,
            is_partner: true,
            partner_code: 'ELITE',
            requires_manual_review: false,
            same_day_available: true,
            badge_text: 'Partner Pricing',
          },
          {
            id: 'new_dimensions_wellness',
            public_name: 'New Dimensions Wellness Patients',
            short_description: 'Exclusive partner pricing for New Dimensions Wellness patients. Mobile blood draw service.',
            starting_price: 85,
            duration_minutes: 60,
            icon: 'heart',
            display_order: 2,
            is_partner: true,
            partner_code: 'NDW',
            requires_manual_review: false,
            same_day_available: true,
            badge_text: 'Partner Pricing',
          },
          {
            id: 'natura_med',
            public_name: 'Natura Med Patients',
            short_description: 'Exclusive partner pricing for Natura Med patients. Mobile blood draw service.',
            starting_price: 85,
            duration_minutes: 60,
            icon: 'heart',
            display_order: 3,
            is_partner: true,
            partner_code: 'NMED',
            requires_manual_review: false,
            same_day_available: true,
            badge_text: 'Partner Pricing',
          },
          {
            id: 'restoration_place',
            public_name: 'The Restoration Place Patients',
            short_description: 'Exclusive partner pricing for The Restoration Place patients. Mobile blood draw service.',
            starting_price: 125,
            duration_minutes: 60,
            icon: 'heart',
            display_order: 4,
            is_partner: true,
            partner_code: 'RSTRP',
            requires_manual_review: false,
            same_day_available: true,
            badge_text: 'Partner Pricing',
          },
        ],
      };

      return new Response(JSON.stringify(localCatalog), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle availability with local fallback
    if (action === 'availability') {
      const zipCode = (data?.zip_code || data?.zip || '') as string;
      const rawRequestedDate = (data?.requested_date || data?.dateFrom || todayEasternStr()) as string;

      // Fetch dynamic business hours and scheduling config from GHS in parallel
      const [dynamicHours, schedulingConfig] = await Promise.all([
        fetchDynamicBusinessHours(),
        fetchSchedulingConfig(),
      ]);

      const effectiveHours = dynamicHours || DEFAULT_BUSINESS_HOURS;
      const APPOINTMENT_DURATION_MINUTES = schedulingConfig?.slotDuration || 60;
      const BUFFER_MINUTES = schedulingConfig?.bufferMinutes || 15;
      const sameDayAllowed = schedulingConfig?.sameDayAllowed || false;

      console.log(`[Availability] Dynamic config: duration=${APPOINTMENT_DURATION_MINUTES}, buffer=${BUFFER_MINUTES}, sameDayAllowed=${sameDayAllowed}, dynamicHours=${!!dynamicHours}`);

      // GHS does not allow same-day bookings (unless scheduling_config says otherwise) — always start from tomorrow (Eastern Time)
      const todayET = todayEasternStr();
      const requestedDate = (!sameDayAllowed && rawRequestedDate <= todayET)
        ? (() => { const d = nowEastern(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()
        : rawRequestedDate;
      
      console.log(`[Availability] Request: ZIP=${zipCode}, date=${requestedDate} (raw: ${rawRequestedDate}, todayET: ${todayET})`);

      // Try GHS get_available_slots API (single call for all dates)
      if (GHS_API_KEY && GHS_API_URL) {
        try {
          const DAYS_TO_QUERY = 14;
          const datesToQuery: string[] = [];
          for (let i = 0; i < DAYS_TO_QUERY; i++) {
            const d = new Date(requestedDate + 'T00:00:00');
            d.setDate(d.getDate() + i);
            datesToQuery.push(d.toISOString().split('T')[0]);
          }

          // Get provider_id from scheduling config if available
          const primaryProviderId = schedulingConfig?.primary_provider_id || '24c46680-1c65-4cbb-943e-3bbf526352b8';

          console.log(`[Availability] Calling get_available_slots for ${datesToQuery.length} dates: ${datesToQuery[0]} to ${datesToQuery[datesToQuery.length - 1]}, provider_id=${primaryProviderId}`);

          const ghsRes = await fetch(GHS_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${GHS_API_KEY}`,
              'X-Client-Source': 'convelabs-web',
            },
            body: JSON.stringify({
              action: 'get_available_slots',
              dates: datesToQuery,
              timezone: 'America/New_York',
              provider_id: primaryProviderId,
            }),
          });

          if (!ghsRes.ok) {
            console.log(`[Availability] get_available_slots returned ${ghsRes.status}, falling back`);
            throw new Error(`GHS returned ${ghsRes.status}`);
          }

          const ghsRawText = await ghsRes.text();
          console.log(`[Availability] get_available_slots raw response (first 500 chars): ${ghsRawText.substring(0, 500)}`);
          
          let ghsData: any;
          try { ghsData = JSON.parse(ghsRawText); } catch { ghsData = {}; }
          // GHS wraps response in { success, data: { dates, ... } }
          const ghsDates = ghsData?.data?.dates || ghsData?.dates || [];
          const serviceDurationFromGHS = ghsData?.data?.service_duration_minutes || ghsData?.service_duration_minutes || APPOINTMENT_DURATION_MINUTES;

          console.log(`[Availability] get_available_slots response: ${ghsDates.length} dates, service_duration=${serviceDurationFromGHS}, total_available=${ghsData?.data?.total_available_slots || ghsData?.total_available_slots || 0}`);

          // Parse GHS response into our TimeSlot format
          const allSlots: any[] = [];

          for (const dateEntry of ghsDates) {
            if (dateEntry.status !== 'available') continue;
            const slotDate = dateEntry.date;
            const providers = dateEntry.providers || [];

            for (const provider of providers) {
              const providerSlots = provider.available_slots || [];
              for (const slot of providerSlots) {
                // GHS returns start_time as ISO local (e.g., "2026-03-10T06:00:00")
                // and optionally "time" as "10:00 AM"
                let startTimeFormatted = slot.time;
                let endTimeFormatted = '';

                // If no formatted time, parse from ISO start_time
                if (!startTimeFormatted && slot.start_time) {
                  const dt = new Date(slot.start_time + (slot.start_time.includes('Z') ? '' : ''));
                  // Extract hours/minutes from local time string (not UTC)
                  const timeParts = slot.start_time.split('T')[1];
                  if (timeParts) {
                    const [hStr, mStr] = timeParts.split(':');
                    let h = parseInt(hStr);
                    const m = parseInt(mStr);
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
                    startTimeFormatted = `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
                  }
                }

                // Calculate end time from end_time_local or start + duration
                if (slot.end_time_local) {
                  const endParts = slot.end_time_local.split('T')[1];
                  if (endParts) {
                    const [hStr, mStr] = endParts.split(':');
                    let h = parseInt(hStr);
                    const m = parseInt(mStr);
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
                    endTimeFormatted = `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
                  }
                }

                if (!endTimeFormatted && startTimeFormatted) {
                  // Fallback: calculate from duration
                  const startMatch = startTimeFormatted.match(/(\d+):(\d+)\s(AM|PM)/);
                  if (startMatch) {
                    let h = parseInt(startMatch[1]);
                    const m = parseInt(startMatch[2]);
                    if (startMatch[3] === 'PM' && h < 12) h += 12;
                    if (startMatch[3] === 'AM' && h === 12) h = 0;
                    const endMin = h * 60 + m + serviceDurationFromGHS;
                    const endH = Math.floor(endMin / 60);
                    const endM = endMin % 60;
                    const endAmpm = endH >= 12 ? 'PM' : 'AM';
                    const displayEndH = endH > 12 ? endH - 12 : (endH === 0 ? 12 : endH);
                    endTimeFormatted = `${displayEndH}:${String(endM).padStart(2, '0')} ${endAmpm}`;
                  }
                }

                if (!startTimeFormatted) continue;

                allSlots.push({
                  id: `ghs-${slotDate}-${startTimeFormatted.replace(/\s/g, '')}-${slot.provider_id || provider.provider_id}`,
                  date: slotDate,
                  startTime: startTimeFormatted,
                  endTime: endTimeFormatted,
                  arrivalWindow: `${startTimeFormatted} - ${endTimeFormatted}`,
                  providerId: slot.provider_id || provider.provider_id,
                  providerName: slot.provider_name || provider.provider_name || 'Nico',
                });
              }
            }
          }

          console.log(`[Availability] Parsed ${allSlots.length} available slots from GHS`);

          // Anomaly detection: if GHS returns >20 slots per day per provider, slots are likely unfiltered
          let isEstimatedFromGHS = false;
          const slotCountsByDateProvider = new Map<string, number>();
          for (const slot of allSlots) {
            const key = `${slot.date}-${slot.providerId}`;
            slotCountsByDateProvider.set(key, (slotCountsByDateProvider.get(key) || 0) + 1);
          }
          for (const [key, count] of slotCountsByDateProvider) {
            if (count > 20) {
              console.log(`[Availability] ANOMALY: ${key} has ${count} raw slots — GHS likely not filtering bookings`);
              isEstimatedFromGHS = true;
              break;
            }
          }

          if (allSlots.length > 0) {
            // Cross-check: fetch GHS appointments to subtract booked times
            // This is a safety net in case get_available_slots doesn't filter properly
            const ghsBookedTimes: { date: string; startMin: number; duration: number }[] = [];
            try {
              const apptRes = await fetch(GHS_API_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${GHS_API_KEY}`,
                  'X-Client-Source': 'convelabs-web',
                },
                body: JSON.stringify({
                  action: 'get_appointments',
                  date_from: datesToQuery[0],
                  date_to: datesToQuery[datesToQuery.length - 1],
                  provider_id: primaryProviderId,
                }),
              });
              if (apptRes.ok) {
                const apptData = await apptRes.json();
                const appointments = apptData?.data?.appointments || apptData?.appointments || [];
                console.log(`[Availability] GHS cross-check: found ${appointments.length} existing appointments`);
                for (const appt of appointments) {
                  const apptDate = appt.date || appt.appointment_date;
                  const apptTime = appt.start_time || appt.appointment_time || appt.time;
                  if (!apptDate || !apptTime) continue;
                  // Parse time to minutes - handle both "HH:MM" and "H:MM AM/PM" formats
                  let apptStartMin = -1;
                  const ampmMatch = apptTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
                  if (ampmMatch) {
                    let h = parseInt(ampmMatch[1]);
                    const m = parseInt(ampmMatch[2]);
                    if (ampmMatch[3].toUpperCase() === 'PM' && h < 12) h += 12;
                    if (ampmMatch[3].toUpperCase() === 'AM' && h === 12) h = 0;
                    apptStartMin = h * 60 + m;
                  } else {
                    const parts = apptTime.split(':').map(Number);
                    if (parts.length >= 2) apptStartMin = parts[0] * 60 + parts[1];
                  }
                  if (apptStartMin >= 0) {
                    ghsBookedTimes.push({
                      date: apptDate,
                      startMin: apptStartMin,
                      duration: appt.duration_minutes || appt.duration || serviceDurationFromGHS,
                    });
                  }
                }
              } else {
                console.log(`[Availability] GHS cross-check returned ${apptRes.status}, skipping`);
              }
            } catch (e) {
              console.log(`[Availability] GHS cross-check failed: ${(e as Error).message}`);
            }

            const parseSlotMinutes = (slot: any): number => {
              const match = slot.startTime.match(/(\d+):(\d+)\s(AM|PM)/);
              if (!match) return -1;
              let h = parseInt(match[1]);
              const m = parseInt(match[2]);
              if (match[3] === 'PM' && h < 12) h += 12;
              if (match[3] === 'AM' && h === 12) h = 0;
              return h * 60 + m;
            };

            // Enforce non-overlapping slot spacing (appointment + buffer)
            const nonOverlappingSlots: any[] = [];
            const slotsByDate = new Map<string, any[]>();
            for (const slot of allSlots) {
              if (!slotsByDate.has(slot.date)) slotsByDate.set(slot.date, []);
              slotsByDate.get(slot.date)!.push(slot);
            }

            for (const [, daySlots] of slotsByDate) {
              daySlots.sort((a: any, b: any) => parseSlotMinutes(a) - parseSlotMinutes(b));
              let lastEndMin = -Infinity;
              for (const slot of daySlots) {
                const startMin = parseSlotMinutes(slot);
                if (startMin < 0) continue;
                if (startMin >= lastEndMin) {
                  nonOverlappingSlots.push(slot);
                  lastEndMin = startMin + serviceDurationFromGHS + BUFFER_MINUTES;
                }
              }
            }

            console.log(`[Availability] After non-overlap spacing: ${nonOverlappingSlots.length} slots`);

            // Filter out slots that overlap with GHS booked appointments
            let filteredSlots = nonOverlappingSlots;
            if (ghsBookedTimes.length > 0) {
              const BUFFER = 15;
              filteredSlots = filteredSlots.filter((slot: any) => {
                const slotStartMin = parseSlotMinutes(slot);
                if (slotStartMin < 0) return true;
                const slotEndMin = slotStartMin + serviceDurationFromGHS;
                return !ghsBookedTimes.some(booked => {
                  if (booked.date !== slot.date) return false;
                  const bookedEnd = booked.startMin + booked.duration;
                  return slotStartMin < (bookedEnd + BUFFER) && slotEndMin > (booked.startMin - BUFFER);
                });
              });
              console.log(`[Availability] After GHS appointment cross-check: ${filteredSlots.length} slots (removed ${nonOverlappingSlots.length - filteredSlots.length} conflicting)`);
            }

            // Check local DB for holds/bookings not yet synced to GHS
            try {
              if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
                const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
                const slotDates = [...new Set(nonOverlappingSlots.map((s: any) => s.date))];
                const minDate = slotDates.sort()[0] || requestedDate;
                const maxDate = [...slotDates].sort().reverse()[0] || requestedDate;

                // Block slots by hold ID
                const unavailableSlotIds = await getUnavailableSlotIds(minDate, maxDate);
                filteredSlots = filteredSlots.filter((slot: any) => !unavailableSlotIds.has(slot.id));

                // Also check local appointments for time-based overlap
                const [{ data: bookedAppts }, { data: activeHolds }] = await Promise.all([
                  supabaseAdmin
                    .from('appointments')
                    .select('appointment_date, appointment_time, duration_minutes, status')
                    .not('status', 'in', '("cancelled","completed","expired")')
                    .gte('appointment_date', minDate)
                    .lte('appointment_date', maxDate),
                  supabaseAdmin
                    .from('booking_holds')
                    .select('slot_id, status, expires_at')
                    .in('status', ['held', 'converted']),
                ]);

                const allBookings: { date: string; start_time: string; duration: number }[] = [];
                if (bookedAppts) {
                  for (const ba of bookedAppts) {
                    if (ba.appointment_time) {
                      allBookings.push({ date: ba.appointment_date, start_time: ba.appointment_time, duration: ba.duration_minutes || 60 });
                    }
                  }
                }

                const now = new Date();
                if (activeHolds) {
                  for (const hold of activeHolds) {
                    if (hold.status === 'held' && hold.expires_at && new Date(hold.expires_at) <= now) continue;
                    const slotId = hold.slot_id || '';
                    const matchingSlot = allSlots.find((s: any) => s.id === slotId);
                    if (matchingSlot) {
                      const mins = parseSlotMinutes(matchingSlot);
                      if (mins >= 0) {
                        const timeStr = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
                        allBookings.push({ date: matchingSlot.date, start_time: timeStr, duration: serviceDurationFromGHS });
                      }
                    }
                  }
                }

                if (allBookings.length > 0) {
                  const BUFFER = 15;
                  filteredSlots = filteredSlots.filter((slot: any) => {
                    const slotStartMin = parseSlotMinutes(slot);
                    if (slotStartMin < 0) return true;
                    const slotEndMin = slotStartMin + serviceDurationFromGHS;
                    const overlaps = allBookings.some(booking => {
                      if (booking.date !== slot.date) return false;
                      const [bH, bM] = booking.start_time.split(':').map(Number);
                      const bookedStart = bH * 60 + bM;
                      const bookedEnd = bookedStart + booking.duration;
                      return slotStartMin < (bookedEnd + BUFFER) && slotEndMin > (bookedStart - BUFFER);
                    });
                    return !overlaps;
                  });
                  console.log(`[Availability] After local booking overlap filter: ${filteredSlots.length} slots`);
                }
              }
            } catch (e) {
              console.log(`[Availability] Local booking check failed: ${(e as Error).message}`);
            }

            // Apply business hours filter as secondary check
            filteredSlots = filteredSlots.filter((slot: any) => {
              const slotDate = new Date(slot.date + 'T12:00:00');
              const dayOfWeek = slotDate.getDay();
              const hours = getBusinessHours(dayOfWeek, effectiveHours);
              if (!hours) return false;

              const slotMin = parseSlotMinutes(slot);
              if (slotMin < 0) return false;

              const [startH, startM] = hours.start.split(':').map(Number);
              const [endH, endM] = hours.end.split(':').map(Number);
              const businessStart = startH * 60 + startM;
              const businessEnd = endH * 60 + endM;
              const slotEndMin = slotMin + serviceDurationFromGHS;
              return slotMin >= businessStart && slotEndMin <= businessEnd;
            });

            console.log(`[Availability] After business hours filter: ${filteredSlots.length} slots`);

            // Sort and tag earliest slot per date as "soonest"
            filteredSlots.sort((a: any, b: any) => {
              if (a.date !== b.date) return a.date.localeCompare(b.date);
              return parseSlotMinutes(a) - parseSlotMinutes(b);
            });
            const seenDates = new Set<string>();
            for (const s of filteredSlots) {
              if (!seenDates.has(s.date)) {
                s.tag = 'soonest';
                seenDates.add(s.date);
              }
            }

            return new Response(JSON.stringify({ slots: filteredSlots, nextAvailableDate: null, isEstimatedAvailability: isEstimatedFromGHS }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          console.log('[Availability] get_available_slots returned 0 available slots, falling back to local DB');
        } catch (e) {
          console.log(`[Availability] GHS API error: ${(e as Error).message}, falling back to local DB`);
        }
      }

      // Local fallback: query Supabase tables directly
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const serviceDuration = (data?.service_duration as number) || 60;
          const localResult = await getLocalAvailability(zipCode, requestedDate, 7, serviceDuration);

          const localToDate = new Date(requestedDate + 'T00:00:00');
          localToDate.setDate(localToDate.getDate() + 7);
          const localUnavailableSlotIds = await getUnavailableSlotIds(requestedDate, localToDate.toISOString().split('T')[0]);
          localResult.slots = localResult.slots.filter((slot: any) => !localUnavailableSlotIds.has(slot.id));
          
          // If first 7 days returned nothing, try extending to 14
          if (localResult.slots.length === 0 && !localResult.nextAvailableDate) {
            const extendedDate = new Date(requestedDate + 'T00:00:00');
            extendedDate.setDate(extendedDate.getDate() + 7);
            const extendedFrom = extendedDate.toISOString().split('T')[0];
            const extendedResult = await getLocalAvailability(zipCode, extendedFrom, 7, serviceDuration);

            const extendedTo = new Date(extendedFrom + 'T00:00:00');
            extendedTo.setDate(extendedTo.getDate() + 7);
            const extendedUnavailableSlotIds = await getUnavailableSlotIds(extendedFrom, extendedTo.toISOString().split('T')[0]);
            const extendedOpenSlots = extendedResult.slots.filter((slot: any) => !extendedUnavailableSlotIds.has(slot.id));
            
            if (extendedOpenSlots.length > 0) {
              return new Response(JSON.stringify({
                slots: [],
                nextAvailableDate: extendedOpenSlots[0].date,
              }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          }

          // Safety net: if GHS was unreachable AND local DB has no bookings to subtract,
          // flag the response so the UI can show a disclaimer
          const isEstimatedAvailability = !localResult._hasGhsData && !localResult._hasLocalBookings;
          if (isEstimatedAvailability) {
            console.warn('[Availability] WARNING: Returning estimated availability with zero known bookings — times may conflict with GHS calendar');
          }

          return new Response(JSON.stringify({
            ...localResult,
            isEstimatedAvailability,
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (e) {
          console.error('[Availability] Local DB query failed:', e.message);
        }
      }

      // Ultimate fallback: return empty
      return new Response(JSON.stringify({ slots: [], nextAvailableDate: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Handle booking-hold locally ──────────────────────
    if (action === 'booking-hold') {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const slotId = data?.slotId as string;
      const slotServiceType = data?.serviceType as string;
      const patient = data?.patient as Record<string, unknown>;

      if (!slotId || !slotServiceType || !patient) {
        return new Response(JSON.stringify({ error: 'Missing slotId, serviceType, or patient data' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create a hold that expires in 15 minutes
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const servicePrice = data?.servicePrice as number | undefined;
      const addOnIds = data?.addOnIds as string[] | undefined;
      const partnerCode = data?.partnerCode as string | undefined;

      const { data: hold, error: holdError } = await supabaseAdmin
        .from('booking_holds')
        .insert({
          slot_id: slotId,
          service_type: slotServiceType,
          patient_data: patient,
          status: 'held',
          expires_at: expiresAt,
          service_price: servicePrice || null,
          add_on_ids: addOnIds || null,
          partner_code: partnerCode || null,
          tenant_id: 'convelabs',
        })
        .select()
        .single();

      if (holdError) {
        console.error('Error creating booking hold:', holdError);
        return new Response(JSON.stringify({ error: 'Failed to create booking hold' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[BookingHold] Created hold ${hold.id}, expires at ${expiresAt}`);
      return new Response(JSON.stringify({
        holdId: hold.id,
        expiresAt: hold.expires_at,
        slotId: hold.slot_id,
        serviceType: hold.service_type,
        status: 'held',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Handle checkout-session locally (Stripe) ─────────
    if (action === 'checkout-session') {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const holdId = data?.holdId as string;
      const csServiceType = data?.serviceType as string;
      const patient = data?.patient as Record<string, unknown>;
      const returnUrl = data?.returnUrl as string;
      const cancelUrl = data?.cancelUrl as string;
      const isSameDay = data?.isSameDay === true;

      if (!holdId || !returnUrl || !cancelUrl) {
        return new Response(JSON.stringify({ error: 'Missing holdId, returnUrl, or cancelUrl' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify the hold exists and is still valid
      const { data: hold, error: holdError } = await supabaseAdmin
        .from('booking_holds')
        .select('*')
        .eq('id', holdId)
        .eq('status', 'held')
        .single();

      if (holdError || !hold) {
        return new Response(JSON.stringify({ error: 'Booking hold not found or expired' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if hold has expired
      if (new Date(hold.expires_at) < new Date()) {
        await supabaseAdmin.from('booking_holds').update({ status: 'expired' }).eq('id', holdId);
        return new Response(JSON.stringify({ error: 'Booking hold has expired. Please select a new time slot.' }), {
          status: 410,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Determine price based on service type
      const servicePrices: Record<string, number> = {
        'at_home_blood_draw': 15000,
        'blood_draw': 15000,
        'senior_blood_draw': 10000,
        'doctor_office_blood_draw': 5500,
        'elite_medical': 7200,
        'new_dimensions_wellness': 8500,
        'natura_med': 8500,
        'restoration_place': 12500,
        'therapeutic_phlebotomy': 22500,
        'specialty_collection': 20000,
      };

      // If hold has service_price stored, use it (most accurate); otherwise fall back to map
      const holdServicePrice = hold.service_price ? hold.service_price : null;
      const unitAmount = holdServicePrice || servicePrices[csServiceType || hold.service_type] || 15000;

      const serviceNames: Record<string, string> = {
        'at_home_blood_draw': 'Mobile Blood Draw (At Home)',
        'blood_draw': 'Mobile Blood Draw (At Home)',
        'senior_blood_draw': 'Senior Blood Draw (65+)',
        'doctor_office_blood_draw': 'Doctor Office Blood Draw',
        'elite_medical': 'Elite Medical Patients - Blood Draw',
        'new_dimensions_wellness': 'New Dimensions Wellness - Blood Draw',
        'natura_med': 'Natura Med Patients - Blood Draw',
        'restoration_place': 'The Restoration Place - Blood Draw',
        'therapeutic_phlebotomy': 'Therapeutic Phlebotomy',
        'specialty_collection': 'Specialty Collection Kit',
      };
      const serviceName = serviceNames[csServiceType || hold.service_type] || 'Mobile Blood Draw';

      // Create Stripe checkout session
      if (!STRIPE_SECRET_KEY) {
        return new Response(JSON.stringify({ error: 'Payment system not configured' }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

      const patientEmail = (patient?.email || hold.patient_data?.email || '') as string;
      const lineItems: any[] = [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: serviceName,
            description: `ConveLabs ${serviceName}`,
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      }];

      // Add same-day surcharge if applicable
      if (isSameDay) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Same-Day Booking Surcharge',
              description: 'Additional fee for same-day appointment scheduling',
            },
            unit_amount: 3500,
          },
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: returnUrl.replace('{CHECKOUT_SESSION_ID}', '{CHECKOUT_SESSION_ID}'),
        cancel_url: cancelUrl,
        customer_email: patientEmail || undefined,
        metadata: {
          hold_id: holdId,
          service_type: csServiceType || hold.service_type,
          service_id: csServiceType || hold.service_type,
          service_price: String(unitAmount),
          slot_id: hold.slot_id,
          provider_id: hold.slot_id.split('-').slice(3).join('-') || '',
          tenant_id: hold.tenant_id || 'convelabs',
          partner_code: hold.partner_code || '',
          booking_reference: `CL-${holdId.substring(0, 8).toUpperCase()}`,
        },
      });

      // Update hold with stripe session info
      await supabaseAdmin.from('booking_holds').update({
        stripe_session_id: session.id,
        stripe_checkout_url: session.url,
        updated_at: new Date().toISOString(),
      }).eq('id', holdId);

      console.log(`[Checkout] Created Stripe session ${session.id} for hold ${holdId}`);
      return new Response(JSON.stringify({
        checkoutUrl: session.url,
        sessionId: session.id,
        holdId,
        expiresAt: hold.expires_at,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Handle checkout-status locally ──────────────────
    if (action === 'checkout-status') {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const checkSessionId = sessionId || (data?.sessionId as string);

      if (!checkSessionId) {
        return new Response(JSON.stringify({ error: 'Missing sessionId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Look up the hold by stripe session ID
      const { data: hold } = await supabaseAdmin
        .from('booking_holds')
        .select('*')
        .eq('stripe_session_id', checkSessionId)
        .single();

      if (!hold) {
        return new Response(JSON.stringify({ status: 'pending' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check Stripe payment status
      if (!STRIPE_SECRET_KEY) {
        return new Response(JSON.stringify({ status: 'pending' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
      const stripeSession = await stripe.checkout.sessions.retrieve(checkSessionId);

      if (stripeSession.payment_status === 'paid' || stripeSession.status === 'complete') {
        // Parse slot info from slot_id (format: ghs-YYYY-MM-DD-slotIndex or YYYY-MM-DD-HH:MM-providerId)
        const slotParts = hold.slot_id.split('-');
        const patientData = hold.patient_data as Record<string, unknown>;
        
        let appointmentDate: string;
        let appointmentTime: string;
        
        if (hold.slot_id.startsWith('ghs-')) {
          // Format: ghs-YYYY-MM-DD-slotIndex
          appointmentDate = slotParts.length >= 4 ? `${slotParts[1]}-${slotParts[2]}-${slotParts[3]}` : hold.slot_id;
          // slotParts[4] is a slot index (e.g. "27"), not a time — convert to approximate time
          if (slotParts.length >= 5) {
            const slotIndex = parseInt(slotParts[4], 10);
            // Slots start at 6:00 AM with 15-min intervals
            const startMinutes = 6 * 60 + slotIndex * 15;
            const hours = Math.floor(startMinutes / 60);
            const mins = startMinutes % 60;
            appointmentTime = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
          } else {
            appointmentTime = '';
          }
        } else {
          // Format: YYYY-MM-DD-HH:MM-providerId
          appointmentDate = slotParts.length >= 3 ? `${slotParts[0]}-${slotParts[1]}-${slotParts[2]}` : hold.slot_id;
          appointmentTime = slotParts.length >= 4 ? slotParts[3] : '';
        }
        const confirmationNumber = `CL-${hold.id.substring(0, 8).toUpperCase()}`;

        // ─── Create appointment in GHS if not already converted ──────
        let ghsBookingId: string | null = null;
        let ghsSyncSuccess = false;
        if (hold.status !== 'converted') {
          // Forward booking to GHS
          if (GHS_API_KEY && GHS_API_URL) {
            try {
              console.log('[GHS-Book] Creating appointment in GHS after payment confirmation');
              const ghsBookPayload = {
                action: 'book',
                slot_id: hold.slot_id,
                service_type: hold.service_type,
                // Send both camelCase and snake_case for GHS compatibility
                first_name: patientData?.firstName || '',
                last_name: patientData?.lastName || '',
                date_of_birth: patientData?.dob || '',
                phone: patientData?.phone || '',
                email: patientData?.email || '',
                address: patientData?.address || '',
                city: patientData?.city || '',
                state: patientData?.state || '',
                zip_code: patientData?.zip || '',
                notes: patientData?.notes || '',
                insurance_carrier: patientData?.insuranceCarrier || '',
                insurance_member_id: patientData?.insuranceMemberId || '',
                lab_order_path: patientData?.labOrderPath || '',
                patient: {
                  first_name: patientData?.firstName || '',
                  last_name: patientData?.lastName || '',
                  date_of_birth: patientData?.dob || '',
                  phone: patientData?.phone || '',
                  email: patientData?.email || '',
                  address: patientData?.address || '',
                  city: patientData?.city || '',
                  state: patientData?.state || '',
                  zip_code: patientData?.zip || '',
                  notes: patientData?.notes || '',
                  insurance_carrier: patientData?.insuranceCarrier || '',
                  insurance_member_id: patientData?.insuranceMemberId || '',
                },
                payment_confirmed: true,
                stripe_session_id: checkSessionId,
                confirmation_number: confirmationNumber,
                hold_id: hold.id,
                requested_date: appointmentDate,
                requested_time: appointmentTime,
                add_on_ids: hold.add_on_ids || [],
                partner_code: hold.partner_code || null,
              };

              console.log(`[GHS-Book] Sending payload to GHS:`, JSON.stringify(ghsBookPayload).substring(0, 800));

              // Try multiple action names for compatibility
              const actionsToTry = ['book', 'create_booking', 'create_appointment'];
              let ghsResponse: Response | null = null;
              let ghsText = '';

              for (const bookAction of actionsToTry) {
                const payload = { ...ghsBookPayload, action: bookAction };
                ghsResponse = await fetch(GHS_API_URL, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GHS_API_KEY}`,
                    'X-Client-Source': 'convelabs-web',
                  },
                  body: JSON.stringify(payload),
                });
                ghsText = await ghsResponse.text();
                console.log(`[GHS-Book] Tried action '${bookAction}': status ${ghsResponse.status}, body: ${ghsText.substring(0, 300)}`);
                
                if (ghsResponse.ok) break;
                
                // If it's a different error than "missing fields", stop trying
                if (ghsResponse.status !== 500 || !ghsText.includes('Missing required')) break;
              }

              // Track sync success
              if (ghsResponse && ghsResponse.ok) {
                ghsSyncSuccess = true;
                try {
                  const ghsResult = JSON.parse(ghsText);
                  ghsBookingId = ghsResult?.bookingId || ghsResult?.booking_id || ghsResult?.id || null;
                  console.log(`[GHS-Book] Successfully created GHS booking: ${ghsBookingId}`);
                } catch {
                  console.log('[GHS-Book] GHS returned non-JSON but status OK');
                }
              } else {
                console.error(`[GHS-Book] GHS booking creation failed: ${ghsResponse?.status} - ${ghsText.substring(0, 300)}`);
                // Log failure to booking_sync_failures table
                try {
                  await supabaseAdmin.from('booking_sync_failures').insert({
                    hold_id: hold.id,
                    ghs_error: ghsText.substring(0, 2000),
                    ghs_status_code: ghsResponse?.status || 0,
                    payload: ghsBookPayload as any,
                  });
                  console.log('[GHS-Book] Sync failure logged to booking_sync_failures');
                } catch (logErr) {
                  console.error(`[GHS-Book] Failed to log sync failure: ${(logErr as Error).message}`);
                }
              }
            } catch (ghsErr) {
              console.error(`[GHS-Book] Error creating GHS booking: ${(ghsErr as Error).message}`);
              // Log the exception as a sync failure
              try {
                await supabaseAdmin.from('booking_sync_failures').insert({
                  hold_id: hold.id,
                  ghs_error: (ghsErr as Error).message,
                  ghs_status_code: 0,
                  payload: { slot_id: hold.slot_id, service_type: hold.service_type } as any,
                });
              } catch (_) { /* best effort */ }
            }
          } else {
            console.warn('[GHS-Book] GHS_API_KEY or GHS_API_URL not configured, skipping GHS booking');
          }

          // Also create a local appointment record (only if patient is a registered user)
          try {
            let patientUserId: string | null = patientData?.userId as string || null;
            if (!patientUserId && patientData?.email) {
              const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ filter: { email: patientData.email as string } });
              if (authUsers?.users?.length) patientUserId = authUsers.users[0].id;
            }

            if (patientUserId) {
              const insertResult = await supabaseAdmin.from('appointments').insert({
                patient_id: patientUserId,
                appointment_date: appointmentDate,
                appointment_time: appointmentTime || null,
                address: `${patientData?.address || ''}, ${patientData?.city || ''}, ${patientData?.state || ''} ${patientData?.zip || ''}`,
                address_street: patientData?.address as string || '',
                address_city: patientData?.city as string || '',
                address_state: patientData?.state as string || '',
                address_zip: patientData?.zip as string || '',
                zipcode: patientData?.zip as string || '00000',
                service_type: hold.service_type,
                status: 'confirmed',
                payment_status: 'paid',
                payment_reference: checkSessionId,
                total_price: (stripeSession.amount_total || 0) / 100,
                notes: `Confirmation: ${confirmationNumber}. Patient: ${patientData?.firstName} ${patientData?.lastName}. Phone: ${patientData?.phone}. Email: ${patientData?.email}. Insurance: ${patientData?.insuranceCarrier || 'N/A'} ${patientData?.insuranceMemberId || ''}. ${patientData?.notes || ''}`.trim(),
                external_booking_id: ghsBookingId || hold.id,
              });

              if (insertResult.error) {
                console.error(`[GHS-Book] Local appointment insert error: ${insertResult.error.message}`);
              } else {
                console.log('[GHS-Book] Local appointment record created');
              }
            } else {
              console.log(`[GHS-Book] Patient not a registered user (${patientData?.email}), skipping local appointment. GHS booking is the system of record.`);
            }
          } catch (localErr) {
            console.error(`[GHS-Book] Failed to create local appointment: ${(localErr as Error).message}`);
          }

          // Mark hold status based on GHS sync result
          const holdStatus = ghsSyncSuccess ? 'converted' : 'paid_pending_sync';
          await supabaseAdmin.from('booking_holds').update({
            status: holdStatus,
            updated_at: new Date().toISOString(),
          }).eq('id', hold.id);

          // Trigger confirmation notifications (best effort)
          if (patientData?.email || patientData?.phone) {
            try {
              const notifUrl = `${SUPABASE_URL}/functions/v1/send-booking-confirmation`;
              await fetch(notifUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                  email: patientData?.email,
                  phone: patientData?.phone,
                  firstName: patientData?.firstName,
                  lastName: patientData?.lastName,
                  appointmentDate,
                  appointmentTime,
                  serviceName: serviceNames[hold.service_type] || 'Mobile Blood Draw',
                  confirmationNumber,
                  address: `${patientData?.address || ''}, ${patientData?.city || ''}, ${patientData?.state || ''} ${patientData?.zip || ''}`,
                }),
              });
              console.log('[GHS-Book] Confirmation notification triggered');
            } catch (notifErr) {
              console.error(`[GHS-Book] Notification trigger failed: ${(notifErr as Error).message}`);
            }
          }
        }

        // Format time to 12h AM/PM
        let displayTime = appointmentTime;
        if (appointmentTime && appointmentTime.includes(':')) {
          const [h, m] = appointmentTime.split(':').map(Number);
          const ampm = h >= 12 ? 'PM' : 'AM';
          const h12 = h % 12 || 12;
          displayTime = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
        }

        // Build full address
        const fullAddress = [
          patientData?.address,
          patientData?.city,
          patientData?.state ? `${patientData.state} ${patientData?.zip || ''}` : patientData?.zip,
        ].filter(Boolean).join(', ');

        // Map service type to friendly name
        const serviceNames: Record<string, string> = {
          'at_home_blood_draw': 'Mobile Blood Draw (At Home)',
          'blood_draw': 'Mobile Blood Draw (At Home)',
          'senior_blood_draw': 'Senior Blood Draw (65+)',
          'doctor_office_blood_draw': 'Doctor Office Blood Draw',
          'elite_medical': 'Elite Medical Patients - Blood Draw',
          'new_dimensions_wellness': 'New Dimensions Wellness - Blood Draw',
          'natura_med': 'Natura Med Patients - Blood Draw',
          'restoration_place': 'The Restoration Place - Blood Draw',
          'therapeutic_phlebotomy': 'Therapeutic Phlebotomy',
          'specialty_collection': 'Specialty Collection Kit',
        };

        return new Response(JSON.stringify({
          status: 'completed',
          bookingId: ghsBookingId || hold.id,
          confirmationNumber,
          appointmentDate,
          appointmentTime: displayTime,
          serviceName: serviceNames[hold.service_type] || 'Mobile Blood Draw',
          price: (stripeSession.amount_total || 0) / 100,
          address: fullAddress || '',
          arrivalWindow: displayTime ? `${displayTime} (±30 min)` : undefined,
          ghsSynced: ghsSyncSuccess,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ status: 'pending' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // All other actions: proxy to GHS
    if (!GHS_API_KEY || !GHS_API_URL) {
      console.error('GHS_API_KEY or GHS_API_URL not configured');
      return new Response(JSON.stringify({ error: 'Service temporarily unavailable' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GHS_API_KEY}`,
      'X-Client-Source': 'convelabs-web',
    };

    const mappedData: Record<string, unknown> = { ...(data || {}) };
    if (mappedData.zip && !mappedData.zip_code) {
      mappedData.zip_code = mappedData.zip;
      delete mappedData.zip;
    }
    if (!mappedData.requested_date) {
      if (mappedData.dateFrom) {
        mappedData.requested_date = mappedData.dateFrom;
        delete mappedData.dateFrom;
      } else {
        mappedData.requested_date = new Date().toISOString().split('T')[0];
      }
    }
    delete mappedData.dateTo;
    delete mappedData.serviceType;

    const url = GHS_API_URL;
    const fetchBody = JSON.stringify({ action, ...mappedData, bookingId, sessionId });
    console.log(`GHS Proxy: POST ${url}`);

    const ghsResponse = await fetch(url, { method: 'POST', headers, body: fetchBody });
    const responseData = await ghsResponse.json();

    if (!ghsResponse.ok) {
      console.error(`GHS API error: ${ghsResponse.status}`, responseData);
      const errorMessages: Record<number, string> = {
        400: 'Invalid request. Please check your information and try again.',
        401: 'Service authentication error. Please try again later.',
        404: 'The requested resource was not found.',
        409: 'This time slot is no longer available. Please choose another.',
        429: 'Too many requests. Please wait a moment and try again.',
        500: 'Our scheduling system is temporarily unavailable. Please call us.',
        503: 'Service is temporarily down for maintenance. Please try again shortly.',
      };

      return new Response(JSON.stringify({
        error: errorMessages[ghsResponse.status] || 'An unexpected error occurred. Please try again or call us.',
        code: ghsResponse.status,
        details: responseData,
      }), {
        status: ghsResponse.status >= 500 ? 502 : ghsResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('GHS Proxy error:', error);

    if (error instanceof TypeError && error.message.includes('fetch')) {
      return new Response(JSON.stringify({
        error: 'Unable to reach scheduling system. Please try again or call (941) 527-9169.',
        code: 'NETWORK_ERROR',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      error: 'Something went wrong. Please try again or call (941) 527-9169.',
      code: 'INTERNAL_ERROR',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
