/**
 * Platform Settings — admin tab
 *
 * Reads + writes a single JSONB row in system_settings(key='platform'). RLS
 * gates writes to admin / super_admin / office_manager only. The
 * get_platform_contact() RPC exposes a sanitized read for non-admin pages.
 *
 * Was previously hardcoded scaffolding (Beverly Hills CA, fake phone, save
 * button that did nothing) — fixed 2026-04-25.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Check, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  DAY_NAMES,
  DEFAULT_OFFICE_HOURS,
  OFFICE_HOURS_KEY,
  normalizeOfficeHours,
  slotsForDay,
  type DayHours,
  type OfficeHours,
} from '@/lib/officeHours';

interface PlatformSettings {
  companyName: string;
  phoneNumber: string;
  supportEmail: string;
  billingEmail: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  timezone: string;
}

const DEFAULT_PLATFORM: PlatformSettings = {
  companyName: 'ConveLabs',
  phoneNumber: '(941) 527-9169',
  supportEmail: 'info@convelabs.com',
  billingEmail: 'info@convelabs.com',
  address: '',
  city: 'Orlando',
  state: 'FL',
  zipCode: '',
  timezone: 'America/New_York',
};

const SettingsTab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'hours' | 'notifications' | 'integrations'>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [platform, setPlatform] = useState<PlatformSettings>(DEFAULT_PLATFORM);
  const [officeHours, setOfficeHours] = useState<OfficeHours>(DEFAULT_OFFICE_HOURS);
  const [savingHours, setSavingHours] = useState(false);
  const [hoursSavedAt, setHoursSavedAt] = useState<number | null>(null);
  const [notifications, setNotifications] = useState({
    emailAppointmentConfirmation: true,
    emailAppointmentReminder: true,
    smsAppointmentReminder: true,
    emailLabResults: true,
    emailBillingNotification: true,
    dailyOwnerBrief: true,
  });

  // Load from system_settings on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings' as any)
          .select('key, value')
          .in('key', ['platform', 'notifications', OFFICE_HOURS_KEY]);
        if (cancelled) return;
        if (error) {
          console.error('[settings] load failed:', error);
          toast.error(`Couldn't load settings: ${error.message}`);
        } else if (data) {
          for (const row of data as any[]) {
            if (row.key === 'platform' && row.value) {
              setPlatform({ ...DEFAULT_PLATFORM, ...(row.value as PlatformSettings) });
            } else if (row.key === 'notifications' && row.value) {
              setNotifications({ ...notifications, ...(row.value as any) });
            } else if (row.key === OFFICE_HOURS_KEY && row.value) {
              setOfficeHours(normalizeOfficeHours(row.value));
            }
          }
        }
      } catch (e: any) {
        console.error('[settings] exception:', e);
        toast.error(e?.message || 'Settings load crashed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function savePlatform(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      // Get current user for the audit trail
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('system_settings' as any)
        .upsert({
          key: 'platform',
          value: platform as any,
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        }, { onConflict: 'key' });

      if (error) {
        console.error('[settings] save failed:', error);
        toast.error(`Save failed — ${error.code || 'error'}: ${error.message}`, { duration: 8000 });
        return;
      }
      setSavedAt(Date.now());
      toast.success('Platform settings saved');
    } catch (e: any) {
      console.error('[settings] save crashed:', e);
      toast.error(e?.message || 'Save crashed');
    } finally {
      setSaving(false);
    }
  }

  function setDay(index: number, patch: Partial<DayHours>) {
    setOfficeHours(h => ({
      ...h,
      days: h.days.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    }));
  }

  async function saveOfficeHours() {
    if (savingHours) return;
    setSavingHours(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('system_settings' as any)
        .upsert({
          key: OFFICE_HOURS_KEY,
          value: officeHours as any,
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        }, { onConflict: 'key' });
      if (error) {
        console.error('[settings] office hours save failed:', error);
        toast.error(`Save failed - ${error.code || 'error'}: ${error.message}`, { duration: 8000 });
        return;
      }
      setHoursSavedAt(Date.now());
      toast.success('Office hours saved');
    } catch (e: any) {
      console.error('[settings] office hours save crashed:', e);
      toast.error(e?.message || 'Save crashed');
    } finally {
      setSavingHours(false);
    }
  }

  async function saveNotifications(updated: typeof notifications) {
    setNotifications(updated);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('system_settings' as any)
        .upsert({
          key: 'notifications',
          value: updated as any,
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        }, { onConflict: 'key' });
      if (error) toast.error(`Couldn't save: ${error.message}`);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    }
  }

  const firstOpenDay = officeHours.days.findIndex(d => !d.closed);
  const openStartTimes = firstOpenDay === -1 ? 0 : slotsForDay(officeHours, firstOpenDay).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-conve-red mr-3" />
          <span className="text-sm text-muted-foreground">Loading settings…</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl">Platform Settings</CardTitle>
        <CardDescription className="text-xs sm:text-sm">Configure system-wide settings · changes save to system_settings</CardDescription>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
          {/* Mobile: horizontal-scroll tabs */}
          <TabsList className="mb-6 w-full overflow-x-auto flex-nowrap whitespace-nowrap -mx-1 px-1 justify-start">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="hours">Office Hours</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <form onSubmit={savePlatform} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Business name"
                  value={platform.companyName}
                  onChange={v => setPlatform(p => ({ ...p, companyName: v }))}
                  placeholder="ConveLabs"
                />
                <Field
                  label="Phone number"
                  type="tel"
                  value={platform.phoneNumber}
                  onChange={v => setPlatform(p => ({ ...p, phoneNumber: v }))}
                  placeholder="(941) 527-9169"
                />
                <Field
                  label="Support / inbound email"
                  type="email"
                  value={platform.supportEmail}
                  onChange={v => setPlatform(p => ({ ...p, supportEmail: v }))}
                  placeholder="info@convelabs.com"
                />
                <Field
                  label="Billing email"
                  type="email"
                  value={platform.billingEmail}
                  onChange={v => setPlatform(p => ({ ...p, billingEmail: v }))}
                  placeholder="info@convelabs.com"
                />
                <div className="md:col-span-2">
                  <Field
                    label="Street address"
                    value={platform.address}
                    onChange={v => setPlatform(p => ({ ...p, address: v }))}
                    placeholder="Your business address"
                  />
                </div>
                <Field
                  label="City"
                  value={platform.city}
                  onChange={v => setPlatform(p => ({ ...p, city: v }))}
                  placeholder="Orlando"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium">State</label>
                    <select
                      value={platform.state}
                      onChange={e => setPlatform(p => ({ ...p, state: e.target.value }))}
                      className="w-full px-3 py-3 border rounded-md min-h-[48px] bg-white"
                    >
                      {['FL','GA','AL','SC','NC','TN'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <Field
                    label="Zip"
                    value={platform.zipCode}
                    onChange={v => setPlatform(p => ({ ...p, zipCode: v }))}
                    placeholder="32801"
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="block text-sm font-medium">Timezone</label>
                  <select
                    value={platform.timezone}
                    onChange={e => setPlatform(p => ({ ...p, timezone: e.target.value }))}
                    className="w-full px-3 py-3 border rounded-md min-h-[48px] bg-white"
                  >
                    <option value="America/New_York">Eastern Time (ET) — Florida</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
                {savedAt && Date.now() - savedAt < 4000 && (
                  <span className="text-xs text-emerald-700 inline-flex items-center justify-center gap-1.5">
                    <Check className="h-3.5 w-3.5" /> Saved
                  </span>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full sm:w-auto bg-conve-red hover:bg-[#991B1B] disabled:bg-gray-300 text-white font-semibold rounded-lg px-6 py-3 min-h-[48px] transition flex items-center justify-center gap-2"
                >
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save changes</>}
                </button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="hours">
            <div className="space-y-1">
              <p className="text-xs text-gray-500 mb-4 flex items-start gap-2">
                <Clock className="h-4 w-4 flex-shrink-0 mt-0.5 text-gray-400" />
                <span>
                  One set of hours, used everywhere: the shaded window on the admin calendar, and the
                  times offered when staff or patients book and reschedule. Closing time is when the
                  last visit ends, so it is never offered as a start time.
                </span>
              </p>

              {officeHours.days.map((day, i) => {
                const noTimes = !day.closed && slotsForDay(officeHours, i).length === 0;
                return (
                  <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 border-b last:border-0">
                    <div className="w-full sm:w-40 flex items-center gap-3">
                      <Switch
                        checked={!day.closed}
                        onCheckedChange={isOpen => setDay(i, { closed: !isOpen })}
                      />
                      <span className={`text-sm font-medium ${day.closed ? 'text-gray-400' : ''}`}>
                        {DAY_NAMES[i]}
                      </span>
                    </div>

                    {day.closed ? (
                      <span className="text-xs text-gray-400">Closed</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={day.open}
                          onChange={e => setDay(i, { open: e.target.value })}
                          className="border rounded-lg px-3 py-2 text-sm min-h-[44px]"
                          aria-label={`${DAY_NAMES[i]} opening time`}
                        />
                        <span className="text-xs text-gray-500">to</span>
                        <input
                          type="time"
                          value={day.close}
                          onChange={e => setDay(i, { close: e.target.value })}
                          className="border rounded-lg px-3 py-2 text-sm min-h-[44px]"
                          aria-label={`${DAY_NAMES[i]} closing time`}
                        />
                      </div>
                    )}

                    {noTimes && (
                      <span className="text-xs text-amber-700 w-full sm:w-auto">
                        Closing is not after opening, so no times will be offered on {DAY_NAMES[i]}.
                      </span>
                    )}
                  </div>
                );
              })}

              <div className="pt-5">
                <label className="block text-sm font-medium mb-1.5">Appointment times every</label>
                <select
                  value={officeHours.slotMinutes}
                  onChange={e => setOfficeHours(h => ({ ...h, slotMinutes: Number(e.target.value) }))}
                  className="border rounded-lg px-3 py-2 text-sm min-h-[44px] w-full sm:w-56"
                >
                  <option value={15}>15 minutes</option>
                  <option value={20}>20 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  An open day gives each patient a choice of {openStartTimes} start times at this spacing.
                </p>
              </div>

              <div className="pt-5">
                <label className="block text-sm font-medium mb-1.5">After-hours surcharge starts at</label>
                <input
                  type="time"
                  value={officeHours.afterHoursFrom}
                  onChange={e => setOfficeHours(h => ({ ...h, afterHoursFrom: e.target.value || h.afterHoursFrom }))}
                  className="border rounded-lg px-3 py-2 text-sm min-h-[44px] w-full sm:w-56"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Draws starting at or after this time carry the after-hours fee. Screens that cannot
                  add that fee, such as the recurring-series builder, stop offering times here.
                </p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5">
                {hoursSavedAt && Date.now() - hoursSavedAt < 4000 && (
                  <span className="text-xs text-emerald-700 inline-flex items-center justify-center gap-1.5">
                    <Check className="h-3.5 w-3.5" /> Saved
                  </span>
                )}
                <button
                  type="button"
                  onClick={saveOfficeHours}
                  disabled={savingHours}
                  className="w-full sm:w-auto bg-conve-red hover:bg-[#991B1B] disabled:bg-gray-300 text-white font-semibold rounded-lg px-6 py-3 min-h-[48px] transition flex items-center justify-center gap-2"
                >
                  {savingHours ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Save className="h-4 w-4" /> Save office hours</>}
                </button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications">
            <div className="space-y-1">
              {Object.entries(notifications).map(([key, value]) => (
                <div key={key} className="flex items-start sm:items-center justify-between gap-3 py-3 border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm capitalize leading-tight">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {key.toLowerCase().includes('sms') ? 'Send SMS for this event' : 'Send email for this event'}
                    </p>
                  </div>
                  <Switch
                    checked={value}
                    onCheckedChange={() => saveNotifications({ ...notifications, [key]: !value })}
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-4">Toggles save automatically.</p>
          </TabsContent>

          <TabsContent value="integrations">
            <div className="space-y-3">
              {[
                { name: 'Stripe', desc: 'Payments + subscriptions', status: 'connected' },
                { name: 'Twilio', desc: 'Patient SMS', status: 'connected' },
                { name: 'Mailgun', desc: 'Outbound email', status: 'connected' },
                { name: 'QuickBooks Online', desc: 'Accounting sync', status: 'connected' },
                { name: 'Google Maps Places', desc: 'Address autocomplete', status: 'connected' },
              ].map(svc => (
                <div key={svc.name} className="border rounded-lg p-3 sm:p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{svc.name}</p>
                    <p className="text-xs text-gray-500">{svc.desc}</p>
                  </div>
                  <span className={`text-xs font-semibold inline-flex items-center gap-1.5 flex-shrink-0 ${svc.status === 'connected' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    <span className={`h-2 w-2 rounded-full ${svc.status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {svc.status === 'connected' ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              ))}
              <p className="text-[11px] text-gray-500 mt-3">Integration credentials live in Supabase secrets · contact Nico to rotate keys.</p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}
const Field: React.FC<FieldProps> = ({ label, value, onChange, type = 'text', placeholder }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium">{label}</label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-3 border rounded-md min-h-[48px] bg-white text-base sm:text-sm focus:border-conve-red focus:outline-none"
    />
  </div>
);

export default SettingsTab;
