import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle, Calendar, Clock, MapPin, Phone, FileText,
  Loader2, AlertCircle, Download, ExternalLink, ArrowRight, UserPlus,
  Users, MessageSquare, Repeat, Sparkles,
} from 'lucide-react';
import SubscribeSeriesModal from '@/components/visit/SubscribeSeriesModal';
import LabOrderTokenUpload from '@/components/visit/LabOrderTokenUpload';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';
import { formatAppointmentDate, formatAppointmentTime, formatAppointmentDateTime } from '@/lib/appointmentDate';

/**
 * VISIT VIEW — Guest-Friendly Booking Lookup
 *
 * Accessed via a tokenized URL: /visit/:token
 * The token acts as bearer auth — knowing the token proves ownership.
 *
 * Shipped via the appointment confirmation email + SMS so patients who
 * booked WITHOUT an account can still see their booking details, add
 * it to their calendar, and upload lab orders — no login required.
 *
 * Also displays an inline "Create an account to track all your visits"
 * CTA for non-authenticated patients who want the full dashboard UX.
 *
 * Hormozi principle: "Zero-friction post-purchase UX. Every login wall
 * after payment is a bet that the patient will jump through your hoop
 * to find what you already owe them. Remove the wall."
 */

interface Visit {
  id: string;
  view_token: string;
  appointment_date: string;
  appointment_time: string;
  service_type: string;
  service_name: string;
  status: string;
  address: string;
  zipcode: string;
  total_amount: number;
  tip_amount: number;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  gate_code: string | null;
  notes: string | null;
  // Sprint 4: series info (if this visit is part of a recurring series)
  recurrence_group_id?: string | null;
  recurrence_sequence?: number | null;
  recurrence_total?: number | null;
  visit_bundle_id?: string | null;
  lab_order_file_path?: string | null;
}

const VisitView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('No visit token provided.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('appointments')
          .select('id, view_token, appointment_date, appointment_time, service_type, service_name, status, address, zipcode, total_amount, tip_amount, patient_name, patient_email, patient_phone, gate_code, notes, recurrence_group_id, recurrence_sequence, recurrence_total, visit_bundle_id, lab_order_file_path')
          .eq('view_token', token)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!data) {
          setError('This visit link is invalid or has been deactivated.');
        } else {
          setVisit(data as unknown as Visit);
        }
      } catch (e: any) {
        setError(e.message || 'Unable to load visit.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const downloadIcs = () => {
    if (!visit) return;
    const d = (visit.appointment_date || '').slice(0, 10).replace(/-/g, '');
    // Parse time safely — expects formats like "10:30 AM" or "10:30:00"
    const parseTime = (t: string): [string, string] => {
      const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
      if (!m) return ['09', '00'];
      let h = parseInt(m[1], 10);
      const min = m[2];
      const period = (m[3] || '').toUpperCase();
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      return [String(h).padStart(2, '0'), min];
    };
    const [h, min] = parseTime(visit.appointment_time || '09:00 AM');
    const [eh, em] = parseTime(
      // End = start + 60 min
      (() => {
        const [H, M] = parseTime(visit.appointment_time || '09:00 AM');
        const total = parseInt(H, 10) * 60 + parseInt(M, 10) + 60;
        const eh = Math.floor(total / 60) % 24;
        const em = total % 60;
        return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
      })()
    );
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ConveLabs//EN',
      'BEGIN:VEVENT',
      `UID:${visit.id}@convelabs.com`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART;TZID=America/New_York:${d}T${h}${min}00`,
      `DTEND;TZID=America/New_York:${d}T${eh}${em}00`,
      `SUMMARY:ConveLabs ${visit.service_name || 'Blood Draw'}`,
      `LOCATION:${(visit.address || '').replace(/,/g, '\\,')}`,
      `DESCRIPTION:Your ConveLabs mobile phlebotomy appointment. Licensed phlebotomist will arrive at your location. Questions? Call (941) 527-9169.`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder — ConveLabs visit tomorrow',
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `convelabs-visit-${d}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-conve-red" />
        </div>
        <Footer />
      </>
    );
  }

  if (error || !visit) {
    return (
      <>
        <Helmet><title>Visit Not Found | ConveLabs</title></Helmet>
        <Header />
        <div className="container mx-auto px-4 py-16 max-w-xl">
          <Card className="border-red-200">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">Visit not found</h1>
              <p className="text-muted-foreground mb-6">{error || "We couldn't find that booking."}</p>
              <a href="tel:+19415279169">
                <Button className="bg-conve-red hover:bg-conve-red-dark text-white">Call us: (941) 527-9169</Button>
              </a>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  const statusLabel: Record<string, { label: string; color: string }> = {
    scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-800' },
    confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-800' },
    en_route: { label: 'Phleb On the Way', color: 'bg-amber-100 text-amber-800' },
    arrived: { label: 'Phleb Arrived', color: 'bg-teal-100 text-teal-800' },
    in_progress: { label: 'Visit in Progress', color: 'bg-purple-100 text-purple-800' },
    specimen_delivered: { label: 'Specimen Delivered', color: 'bg-indigo-100 text-indigo-800' },
    completed: { label: 'Completed', color: 'bg-gray-100 text-gray-700' },
    cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  };
  const s = statusLabel[visit.status] || statusLabel.scheduled;

  return (
    <>
      <Helmet>
        <title>Your Visit | ConveLabs</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Header />

      <div className="container mx-auto px-4 py-10 max-w-2xl">
        {/* Status header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border mb-3 border-gray-200">
            <span className={`inline-flex h-2 w-2 rounded-full ${s.color.replace('text-', 'bg-').replace('-800', '-500').replace('-700', '-500')}`}></span>
            {s.label}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Your ConveLabs Visit
          </h1>
          <p className="text-muted-foreground">Hi {visit.patient_name?.split(' ')[0] || 'there'} — here are your details.</p>
        </div>

        {/* Recurring series indicator (Sprint 4) */}
        {visit.recurrence_total && visit.recurrence_total > 1 && (
          <Card className={`mb-4 border ${visit.visit_bundle_id ? 'bg-emerald-50 border-emerald-200' : 'bg-indigo-50 border-indigo-200'}`}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${visit.visit_bundle_id ? 'bg-emerald-100' : 'bg-indigo-100'}`}>
                <Repeat className={`h-4 w-4 ${visit.visit_bundle_id ? 'text-emerald-700' : 'text-indigo-700'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${visit.visit_bundle_id ? 'text-emerald-900' : 'text-indigo-900'}`}>
                  Visit {visit.recurrence_sequence} of {visit.recurrence_total}
                  {visit.visit_bundle_id && <span className="text-xs font-medium ml-1">· Prepaid bundle</span>}
                </p>
                <p className={`text-xs mt-0.5 ${visit.visit_bundle_id ? 'text-emerald-700' : 'text-indigo-700'}`}>
                  {visit.visit_bundle_id
                    ? `This visit is covered by your prepaid package — nothing due today.`
                    : `Part of your recurring appointment series with ConveLabs.`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Primary card */}
        <Card className="shadow-md border-gray-200 mb-4">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-conve-red/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-5 w-5 text-conve-red" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">When</p>
                <p className="text-lg font-semibold text-gray-900 leading-tight">
                  {formatAppointmentDate(visit.appointment_date)}
                </p>
                <p className="text-conve-red font-semibold">{formatAppointmentTime(visit.appointment_time)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-conve-red/10 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-5 w-5 text-conve-red" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Where</p>
                <p className="text-sm text-gray-900">{visit.address || 'Address pending'}</p>
                {visit.gate_code && (
                  <p className="text-xs text-gray-500 mt-0.5">Gate: <span className="font-mono font-bold text-conve-red">{visit.gate_code}</span></p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-full bg-conve-red/10 flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-conve-red" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Service</p>
                <p className="text-sm font-medium text-gray-900">{visit.service_name || visit.service_type}</p>
                {visit.total_amount > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Paid: ${Number(visit.total_amount).toFixed(2)}
                    {visit.tip_amount > 0 && <span> · Tip: ${Number(visit.tip_amount).toFixed(2)}</span>}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lab order upload — appears when none on file; turns into "✓ on file" once uploaded */}
        {visit.status !== 'cancelled' && visit.status !== 'completed' && (
          <div className="mb-6">
            <LabOrderTokenUpload
              viewToken={visit.view_token}
              alreadyUploaded={!!visit.lab_order_file_path}
              onUploaded={(newPath) => setVisit(v => v ? { ...v, lab_order_file_path: newPath } : v)}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button variant="outline" onClick={downloadIcs} className="h-12 gap-2">
            <Download className="h-4 w-4" />
            Add to Calendar
          </Button>
          <a href="tel:+19415279169" className="contents">
            <Button variant="outline" className="h-12 gap-2 w-full">
              <Phone className="h-4 w-4" />
              Call Us
            </Button>
          </a>
        </div>

        {/* Subscribe & save CTA — only for one-off visits (not already in a series) */}
        {!visit.recurrence_group_id && (
          <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white mb-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-bl-lg tracking-wide">
              SAVE 15%
            </div>
            <CardContent className="p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="h-11 w-11 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 text-sm">
                    Need this on a schedule? <span className="text-emerald-700">Save 15% on every visit.</span>
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Auto-scheduled monthly, quarterly, or on your cadence. Pause or cancel anytime — you're not locked in.
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs text-gray-700 mb-4 pl-1">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>15% off your current price — automatically, every visit</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>Same phleb, same address, same prep — we handle the calendar</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>Pause, skip, or cancel with one text — no commitment</span>
                </li>
              </ul>
              <Button
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                onClick={() => setSubscribeOpen(true)}
              >
                <Sparkles className="h-4 w-4" />
                Subscribe &amp; save 15%
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Family member upsell — Hormozi post-purchase offer */}
        {(() => {
          const firstName = visit.patient_name?.split(' ')[0] || 'there';
          const dateStr = formatAppointmentDate(visit.appointment_date);
          const timeStr = formatAppointmentTime(visit.appointment_time);
          const smsBody = encodeURIComponent(
            `Hi, this is ${visit.patient_name || 'a ConveLabs patient'}. I'd like to add a family member to my visit on ${dateStr} at ${timeStr} (${visit.address || 'my address'}). Please send me the $75 add-on payment link. Thanks!`
          );
          const smsHref = `sms:+19415279169${/iPad|iPhone|iPod/.test(navigator.userAgent) ? '&' : '?'}body=${smsBody}`;
          const logCompanionIntent = async (channel: 'sms' | 'call') => {
            try {
              await supabase.functions.invoke('log-upgrade-event', {
                body: {
                  event_type: 'companion_click',
                  status: 'intent',
                  patient_email: visit.patient_email,
                  patient_name: visit.patient_name,
                  patient_phone: visit.patient_phone,
                  appointment_id: visit.id,
                  potential_cents: 7500,
                  metadata: { channel, source: 'visit_page_upsell_card' },
                },
              });
            } catch (_e) { /* non-blocking */ }
          };
          return (
            <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white mb-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-bl-lg tracking-wide">
                SAVE $75
              </div>
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-11 w-11 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <Users className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm">
                      Bring a family member for just <span className="text-emerald-700">$75</span>
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Normally $150 — same visit, same address, no second trip fee. Spouse, parent, kid. One tap to add.
                    </p>
                  </div>
                </div>
                <ul className="space-y-1.5 text-xs text-gray-700 mb-4 pl-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>We come out once — blood draw for both of you back-to-back</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Separate lab orders + results per person (HIPAA-safe)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Secure payment link texted back to you in minutes</span>
                  </li>
                </ul>
                <div className="grid grid-cols-2 gap-2">
                  <a href={smsHref} className="contents" onClick={() => logCompanionIntent('sms')}>
                    <Button className="h-11 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white w-full">
                      <MessageSquare className="h-4 w-4" />
                      Text to Add
                    </Button>
                  </a>
                  <a href="tel:+19415279169" className="contents" onClick={() => logCompanionIntent('call')}>
                    <Button variant="outline" className="h-11 gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 w-full">
                      <Phone className="h-4 w-4" />
                      Call Us
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* What to prepare */}
        <Card className="bg-gray-50 border-gray-200 mb-6">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Before Your Visit</p>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>Have your lab order ready (paper or PDF on your phone)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>Keep your insurance card nearby</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>Hydrate well — makes the draw faster and less painful</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>If fasting required (glucose/lipid panels): 8–12 hours, water OK</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Account creation CTA */}
        <Card className="border-conve-red/20 bg-gradient-to-br from-conve-red/5 to-white mb-6">
          <CardContent className="p-5 flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-conve-red/10 flex items-center justify-center flex-shrink-0">
              <UserPlus className="h-5 w-5 text-conve-red" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm mb-1">Track all your visits in one place</p>
              <p className="text-xs text-gray-600 mb-3">
                Create a free ConveLabs account — same email — and you'll see this visit plus your history, upload lab orders, and manage appointments.
              </p>
              <Link to={`/login?signup=1&email=${encodeURIComponent(visit.patient_email)}`}>
                <Button size="sm" className="bg-conve-red hover:bg-conve-red-dark text-white gap-2">
                  Create Account <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Footer contact */}
        <p className="text-center text-xs text-gray-400">
          Need to reschedule? Call <a href="tel:+19415279169" className="text-conve-red underline">(941) 527-9169</a>.
          <br />
          This link is unique to you — don't share it publicly.
        </p>
      </div>

      <Footer />

      {/* Subscribe modal — Tier 3 */}
      <SubscribeSeriesModal
        open={subscribeOpen}
        onClose={() => setSubscribeOpen(false)}
        visit={visit}
      />
    </>
  );
};

export default VisitView;
