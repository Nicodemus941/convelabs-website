/**
 * AppointmentTrackPage — patient lands here from the "phleb is on the
 * way" SMS. Shows live status with polling: en_route, arrived,
 * in_progress, completed. Token-only via view_token.
 *
 * Route: /appt/:token/track
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Truck, MapPin, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

interface TrackData {
  appointment_status: string;
  en_route: boolean;
  arrived: boolean;
  completed: boolean;
  cancelled: boolean;
  phleb_lat: number | null;
  phleb_lng: number | null;
  last_known_at: string | null;
}

interface Summary {
  patient_first_name: string;
  appointment_date: string;
  appointment_time: string | null;
  address: string | null;
}

const AppointmentTrackPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [track, setTrack] = useState<TrackData | null>(null);

  // Initial summary load
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/appointment-self-service?token=${encodeURIComponent(token)}`, {
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        });
        const j = await res.json();
        if (!res.ok) {
          setError(j.error === 'expired' ? 'This link has expired.' : 'Could not load your appointment.');
        } else {
          setSummary(j.appointment);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Poll track state every 20s while page is open
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/appointment-self-service`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ action: 'track', token }),
        });
        const j = await res.json();
        if (!cancelled && res.ok) setTrack(j);
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" /></div>;

  if (error || !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border rounded-2xl p-6 shadow-sm text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Couldn't load tracking</h1>
          <p className="text-sm text-gray-600">{error || 'Try the link again.'}</p>
          <p className="text-xs text-gray-400 mt-4">Email <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a> or call (941) 527-9169.</p>
        </div>
      </div>
    );
  }

  // Status copy map
  let statusIcon = Clock;
  let statusTitle = 'Scheduled';
  let statusBlurb = `Your phlebotomist hasn't started moving yet. We'll text you the moment they're on their way.`;
  let statusColor = 'bg-gray-100 text-gray-700 border-gray-200';
  let pulse = false;

  if (track?.cancelled) {
    statusIcon = AlertTriangle; statusTitle = 'Cancelled'; statusBlurb = 'This visit was cancelled.';
    statusColor = 'bg-gray-100 text-gray-700 border-gray-200';
  } else if (track?.completed) {
    statusIcon = CheckCircle2; statusTitle = 'Visit complete'; statusBlurb = 'Your specimen is on its way to the lab. Results within 48–72 hours.';
    statusColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
  } else if (track?.arrived) {
    statusIcon = MapPin; statusTitle = 'Arrived'; statusBlurb = 'Your phlebotomist is on site.';
    statusColor = 'bg-blue-50 text-blue-800 border-blue-200';
  } else if (track?.en_route) {
    statusIcon = Truck; statusTitle = 'On the way'; statusBlurb = 'Your phlebotomist is en route. Have a sterile, well-lit area ready.';
    statusColor = 'bg-amber-50 text-amber-900 border-amber-200';
    pulse = true;
  }

  const Icon = statusIcon;
  const dateLabel = new Date(String(summary.appointment_date).substring(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white px-6 py-5">
            <h1 className="text-xl font-bold">Track your visit</h1>
            <p className="text-sm opacity-90 mt-0.5">ConveLabs · {summary.patient_first_name}</p>
          </div>

          <div className="p-6">
            <div className={`rounded-xl border-2 p-5 text-center ${statusColor} ${pulse ? 'animate-pulse' : ''}`}>
              <Icon className="h-12 w-12 mx-auto mb-2" />
              <h2 className="text-2xl font-bold">{statusTitle}</h2>
              <p className="text-sm mt-2 leading-relaxed">{statusBlurb}</p>
              {track?.en_route && track.phleb_lat && track.phleb_lng && (
                <a
                  href={`https://www.google.com/maps?q=${track.phleb_lat},${track.phleb_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-sm font-semibold underline"
                >
                  See last known location →
                </a>
              )}
            </div>

            <div className="mt-5 bg-gray-50 border rounded-lg p-3 text-sm space-y-1">
              <p className="text-gray-900"><strong>{dateLabel}{summary.appointment_time ? ` at ${summary.appointment_time}` : ''}</strong></p>
              {summary.address && <p className="text-gray-700 text-xs">{summary.address}</p>}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5 text-[11px] text-gray-600">
              <p>This page updates every 20 seconds.</p>
              <p>Need to reach us? <a href="tel:+19415279169" className="text-[#B91C1C] font-semibold">(941) 527-9169</a></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppointmentTrackPage;
