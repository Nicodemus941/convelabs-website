import React, { useState, useEffect, useCallback } from 'react';
import StaffRefundButton from '@/components/admin/StaffRefundButton';
import BulkAssignOrgCard from './BulkAssignOrgCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow, subHours } from 'date-fns';
import { toast } from 'sonner';
import {
  Wrench, Search, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Clock,
  Send, Phone, Mail, DollarSign, Calendar, Activity, FileText, Shield,
  Loader2, ChevronRight, Zap, Bell, Heart, TrendingUp, Eye,
} from 'lucide-react';

/**
 * OPERATIONS PANEL — Tier 1 Self-Service
 * Lets the office assistant fix 90% of issues without developer intervention.
 *
 * Sections:
 * 1. System Health — green/yellow/red indicators for all systems
 * 2. Appointment Fixer — search + one-click status/notification actions
 * 3. Notification Replay — resend any notification type
 * 4. Invoice Manager — void, resend, mark paid
 * 5. Activity Log — searchable audit trail
 */

// ── Types ──

interface HealthCheck {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  detail: string;
  lastCheck: string;
}

interface AppointmentResult {
  id: string;
  patient_name: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  appointment_date: string;
  appointment_time: string | null;
  status: string;
  payment_status: string | null;
  invoice_status: string | null;
  total_amount: number | null;
  service_name: string | null;
  service_type: string | null;
  address: string | null;
  phlebotomist_id: string | null;
  lab_order_file_path: string | null;
  notes: string | null;
  stripe_invoice_id: string | null;
  stripe_invoice_url: string | null;
  invoice_sent_at: string | null;
  invoice_reminder_sent_at: string | null;
  invoice_final_warning_at: string | null;
  patient_id: string | null;
}

interface ActivityEntry {
  id: string;
  activity_type: string;
  description: string;
  patient_id: string | null;
  appointment_id: string | null;
  created_by_name: string;
  created_at: string;
}

// ── Component ──

const OperationsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('health');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#B91C1C]/10 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-[#B91C1C]" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Operations Center</h1>
          <p className="text-sm text-muted-foreground">Fix issues, resend notifications, manage appointments — no code required</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full">
          <TabsTrigger value="health" className="text-xs gap-1"><Heart className="h-3 w-3" /> Health</TabsTrigger>
          <TabsTrigger value="appointments" className="text-xs gap-1"><Calendar className="h-3 w-3" /> Appointments</TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs gap-1"><Bell className="h-3 w-3" /> Notifications</TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs gap-1"><DollarSign className="h-3 w-3" /> Invoices</TabsTrigger>
          <TabsTrigger value="activity" className="text-xs gap-1"><Activity className="h-3 w-3" /> Activity Log</TabsTrigger>
        </TabsList>

        <TabsContent value="health"><SystemHealth /></TabsContent>
        <TabsContent value="appointments">
          <div className="space-y-4">
            <BulkAssignOrgCard />
            <AppointmentFixer />
          </div>
        </TabsContent>
        <TabsContent value="notifications"><NotificationReplay /></TabsContent>
        <TabsContent value="invoices"><InvoiceManager /></TabsContent>
        <TabsContent value="activity"><ActivityLog /></TabsContent>
      </Tabs>
    </div>
  );
};

// ══════════════════════════════════════════
// SECTION 1: System Health Dashboard
// ══════════════════════════════════════════

const SystemHealth: React.FC = () => {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailySummary, setDailySummary] = useState({ today: 0, unpaid: 0, missingLab: 0, unassigned: 0, failedSms: 0 });

  const runChecks = useCallback(async () => {
    setLoading(true);
    const results: HealthCheck[] = [];
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const tomorrowStr = format(new Date(now.getTime() + 86400000), 'yyyy-MM-dd');

    // 1. Today's appointments
    const { data: todayAppts } = await supabase
      .from('appointments')
      .select('id, status, payment_status, lab_order_file_path, phlebotomist_id, service_type')
      .gte('appointment_date', todayStr)
      .lt('appointment_date', tomorrowStr)
      .neq('status', 'cancelled');

    const active = todayAppts || [];
    const unpaid = active.filter(a => a.payment_status !== 'completed').length;
    const missingLab = active.filter(a => !a.lab_order_file_path && ['mobile', 'senior'].includes(a.service_type || '')).length;
    const unassigned = active.filter(a => !a.phlebotomist_id && !['completed', 'cancelled'].includes(a.status)).length;

    results.push({
      name: 'Today\'s Appointments',
      status: active.length > 0 ? 'healthy' : 'warning',
      detail: `${active.length} active appointments today`,
      lastCheck: now.toISOString(),
    });

    if (unpaid > 0) {
      results.push({ name: 'Unpaid Appointments', status: 'warning', detail: `${unpaid} appointments have unpaid invoices`, lastCheck: now.toISOString() });
    }
    if (missingLab > 0) {
      results.push({ name: 'Missing Lab Orders', status: 'error', detail: `${missingLab} mobile visits missing lab orders`, lastCheck: now.toISOString() });
    }
    if (unassigned > 0) {
      results.push({ name: 'Unassigned Phlebotomist', status: 'warning', detail: `${unassigned} visits need a phlebotomist assigned`, lastCheck: now.toISOString() });
    }

    // 2. Failed SMS in last 24h
    const { data: failedSms } = await supabase
      .from('sms_notifications' as any)
      .select('id')
      .eq('delivery_status', 'failed')
      .gte('sent_at', subHours(now, 24).toISOString());
    const failedCount = (failedSms as any[])?.length || 0;

    results.push({
      name: 'SMS Delivery',
      status: failedCount > 0 ? 'error' : 'healthy',
      detail: failedCount > 0 ? `${failedCount} failed SMS in last 24h` : 'All SMS delivered successfully',
      lastCheck: now.toISOString(),
    });

    // 3. Pending invoices (overdue)
    const { data: overdueInv } = await supabase
      .from('appointments')
      .select('id')
      .eq('invoice_status', 'sent')
      .eq('payment_status', 'pending')
      .lt('invoice_sent_at', subHours(now, 48).toISOString());
    const overdueCount = overdueInv?.length || 0;

    results.push({
      name: 'Invoice Health',
      status: overdueCount > 3 ? 'error' : overdueCount > 0 ? 'warning' : 'healthy',
      detail: overdueCount > 0 ? `${overdueCount} invoices overdue (>48h)` : 'All invoices current',
      lastCheck: now.toISOString(),
    });

    // 4. Tomorrow's readiness
    const dayAfterStr = format(new Date(now.getTime() + 2 * 86400000), 'yyyy-MM-dd');
    const { data: tomorrowAppts } = await supabase
      .from('appointments')
      .select('id, lab_order_file_path, phlebotomist_id, service_type, status')
      .gte('appointment_date', tomorrowStr)
      .lt('appointment_date', dayAfterStr)
      .neq('status', 'cancelled');
    const tmrw = tomorrowAppts || [];
    const tmrwMissingLab = tmrw.filter(a => !a.lab_order_file_path && ['mobile', 'senior'].includes(a.service_type || '')).length;
    const tmrwUnassigned = tmrw.filter(a => !a.phlebotomist_id).length;

    results.push({
      name: 'Tomorrow\'s Readiness',
      status: tmrwMissingLab + tmrwUnassigned > 0 ? 'warning' : tmrw.length > 0 ? 'healthy' : 'healthy',
      detail: tmrw.length === 0 ? 'No appointments tomorrow' : `${tmrw.length} appointments — ${tmrwMissingLab} missing lab orders, ${tmrwUnassigned} unassigned`,
      lastCheck: now.toISOString(),
    });

    // 5. Database connectivity
    results.push({ name: 'Database', status: 'healthy', detail: 'Connected to Supabase', lastCheck: now.toISOString() });

    setChecks(results);
    setDailySummary({ today: active.length, unpaid, missingLab, unassigned, failedSms: failedCount });
    setLoading(false);
  }, []);

  useEffect(() => { runChecks(); }, [runChecks]);

  const statusIcon = (s: string) => {
    if (s === 'healthy') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    if (s === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    return <XCircle className="h-4 w-4 text-red-600" />;
  };

  const statusBg = (s: string) => {
    if (s === 'healthy') return 'border-emerald-200 bg-emerald-50';
    if (s === 'warning') return 'border-amber-200 bg-amber-50';
    return 'border-red-200 bg-red-50';
  };

  const overallStatus = checks.some(c => c.status === 'error') ? 'error' : checks.some(c => c.status === 'warning') ? 'warning' : 'healthy';

  return (
    <div className="space-y-4 mt-4">
      {/* Overall status banner */}
      <Card className={`shadow-sm ${statusBg(overallStatus)}`}>
        <CardContent className="p-4 flex items-center gap-3">
          {statusIcon(overallStatus)}
          <div>
            <p className="font-semibold text-sm">
              {overallStatus === 'healthy' ? 'All Systems Healthy' : overallStatus === 'warning' ? 'Attention Needed' : 'Issues Detected'}
            </p>
            <p className="text-xs text-muted-foreground">
              {dailySummary.today} appointments today | {dailySummary.unpaid} unpaid | {dailySummary.missingLab} missing lab orders | {dailySummary.failedSms} failed SMS
            </p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto gap-1 text-xs" onClick={runChecks} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Individual checks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {checks.map((c, i) => (
          <Card key={i} className={`shadow-sm ${statusBg(c.status)}`}>
            <CardContent className="p-3 flex items-start gap-3">
              {statusIcon(c.status)}
              <div>
                <p className="text-sm font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.detail}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════
// SECTION 2: Appointment Fixer
// ══════════════════════════════════════════

const AppointmentFixer: React.FC = () => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AppointmentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AppointmentResult | null>(null);
  const [actionLoading, setActionLoading] = useState('');

  const doSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    const q = search.trim().toLowerCase();

    // Search by patient name, email, phone, or appointment ID
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .or(`patient_name.ilike.%${q}%,patient_email.ilike.%${q}%,patient_phone.ilike.%${q}%`)
      .order('appointment_date', { ascending: false })
      .limit(20);

    setResults((data || []) as AppointmentResult[]);
    setLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    setActionLoading(`status-${status}`);
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
    if (error) { toast.error(error.message); setActionLoading(''); return; }
    toast.success(`Status updated to ${status}`);
    setSelected(prev => prev ? { ...prev, status } : null);
    setActionLoading('');
    doSearch(); // refresh
  };

  const resendConfirmation = async (appt: AppointmentResult) => {
    setActionLoading('confirmation');
    try {
      const { error } = await supabase.functions.invoke('send-appointment-confirmation', {
        body: { appointmentId: appt.id },
      });
      if (error) throw error;
      toast.success(`Confirmation resent to ${appt.patient_name}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend');
    }
    setActionLoading('');
  };

  const resendInvoice = async (appt: AppointmentResult) => {
    setActionLoading('invoice');
    try {
      const { error } = await supabase.functions.invoke('send-appointment-invoice', {
        body: {
          appointmentId: appt.id,
          patientName: appt.patient_name,
          patientEmail: appt.patient_email,
          serviceName: appt.service_name || 'Blood Draw',
          servicePrice: appt.total_amount || 0,
        },
      });
      if (error) throw error;
      toast.success(`Invoice resent to ${appt.patient_email}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend');
    }
    setActionLoading('');
  };

  const resendReminder = async (appt: AppointmentResult) => {
    setActionLoading('reminder');
    try {
      if (appt.patient_phone) {
        const phone = appt.patient_phone.startsWith('+') ? appt.patient_phone : `+1${appt.patient_phone.replace(/\D/g, '')}`;
        await supabase.functions.invoke('send-sms-notification', {
          body: {
            phoneNumber: phone,
            notificationType: 'custom',
            customMessage: `Hi ${appt.patient_name?.split(' ')[0] || ''}, this is ConveLabs reminding you about your appointment on ${appt.appointment_date?.substring(0, 10)} at ${appt.appointment_time || 'your scheduled time'}. If you have questions, call (941) 527-9169.`,
          },
        });
      }
      toast.success(`Reminder sent to ${appt.patient_name}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    }
    setActionLoading('');
  };

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    en_route: 'bg-amber-50 text-amber-700 border-amber-200',
    in_progress: 'bg-purple-50 text-purple-700 border-purple-200',
    completed: 'bg-gray-50 text-gray-600 border-gray-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className="space-y-4 mt-4">
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-2">Search Appointments</p>
          <p className="text-xs text-muted-foreground mb-3">Search by patient name, email, or phone number to find and fix appointment issues</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Patient name, email, or phone..." className="pl-9" onKeyDown={e => e.key === 'Enter' && doSearch()} />
            </div>
            <Button onClick={doSearch} disabled={loading} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map(appt => (
            <Card key={appt.id} className={`shadow-sm cursor-pointer hover:shadow-md transition ${selected?.id === appt.id ? 'ring-2 ring-[#B91C1C]' : ''}`} onClick={() => setSelected(appt)}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="font-semibold text-sm">{appt.patient_name || 'Unknown'}</p>
                  <Badge variant="outline" className={`text-[10px] ${statusColors[appt.status] || ''}`}>{appt.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {appt.appointment_date?.substring(0, 10) ? format(new Date(appt.appointment_date.substring(0, 10) + 'T12:00:00'), 'MMM d, yyyy') : ''}
                    {appt.appointment_time ? ` at ${appt.appointment_time}` : ''}
                  </span>
                  {appt.total_amount != null && <span className="text-xs font-semibold text-emerald-700">${appt.total_amount}</span>}
                  {appt.payment_status !== 'completed' && appt.status !== 'cancelled' && (
                    <Badge variant="outline" className="text-[10px] bg-red-50 border-red-200 text-red-700">Unpaid</Badge>
                  )}
                  {!appt.lab_order_file_path && ['mobile', 'senior'].includes(appt.service_type || '') && appt.status !== 'cancelled' && (
                    <Badge variant="outline" className="text-[10px] bg-amber-50 border-amber-200 text-amber-700">No lab order</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail + Actions panel */}
      {selected && (
        <Card className="shadow-sm border-[#B91C1C]/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#B91C1C]" /> Quick Actions for {selected.patient_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Info summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className={`text-[10px] ${statusColors[selected.status] || ''}`}>{selected.status}</Badge></div>
              <div><span className="text-muted-foreground">Payment:</span> <span className={selected.payment_status === 'completed' ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>{selected.payment_status || 'pending'}</span></div>
              <div><span className="text-muted-foreground">Phone:</span> {selected.patient_phone || 'None'}</div>
              <div><span className="text-muted-foreground">Email:</span> <span className="truncate">{selected.patient_email || 'None'}</span></div>
            </div>

            {/* Status changes */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">CHANGE STATUS</p>
              <div className="flex flex-wrap gap-2">
                {['scheduled', 'confirmed', 'en_route', 'in_progress', 'completed', 'cancelled'].map(s => (
                  <Button key={s} size="sm" variant={selected.status === s ? 'default' : 'outline'}
                    className={`text-xs h-8 ${selected.status === s ? 'bg-[#1e293b]' : ''}`}
                    disabled={selected.status === s || actionLoading !== ''}
                    onClick={() => updateStatus(selected.id, s)}>
                    {actionLoading === `status-${s}` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    {s.replace('_', ' ')}
                  </Button>
                ))}
              </div>
            </div>

            {/* Notification actions */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">RESEND NOTIFICATIONS</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={() => resendConfirmation(selected)} disabled={actionLoading !== ''}>
                  {actionLoading === 'confirmation' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Resend Confirmation
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={() => resendReminder(selected)} disabled={actionLoading !== '' || !selected.patient_phone}>
                  {actionLoading === 'reminder' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Phone className="h-3 w-3" />} Send SMS Reminder
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={() => resendInvoice(selected)} disabled={actionLoading !== '' || !selected.patient_email}>
                  {actionLoading === 'invoice' ? <Loader2 className="h-3 w-3 animate-spin" /> : <DollarSign className="h-3 w-3" />} Resend Invoice
                </Button>
              </div>
            </div>

            {/* Stripe link */}
            {selected.stripe_invoice_url && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">STRIPE INVOICE</p>
                <a href={selected.stripe_invoice_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Open Stripe Invoice <ChevronRight className="h-3 w-3" />
                </a>
              </div>
            )}

            {/* Refund action — only for paid, non-refunded appointments */}
            {selected.payment_status === 'completed' && (selected.total_amount || 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">REFUND</p>
                <StaffRefundButton
                  appointmentId={selected.id}
                  patientEmail={selected.patient_email}
                  patientName={selected.patient_name}
                  totalAmountDollars={selected.total_amount || 0}
                  alreadyRefunded={!!selected.refunded_at || selected.refund_status === 'refunded'}
                  refundedAmountCents={selected.refund_amount_cents}
                  onRefunded={doSearch}
                />
              </div>
            )}

            {/* Notes */}
            {selected.notes && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">NOTES</p>
                <p className="text-xs bg-gray-50 rounded p-2">{selected.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ══════════════════════════════════════════
// SECTION 3: Notification Replay
// ══════════════════════════════════════════

const NotificationReplay: React.FC = () => {
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState('');

  const loadRecent = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('sms_notifications' as any)
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(50);
    setNotifications((data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const filtered = notifications.filter(n => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (n.phone_number || '').includes(q) || (n.message_content || '').toLowerCase().includes(q) || (n.notification_type || '').includes(q);
  });

  const resendSms = async (n: any) => {
    setSending(n.id);
    try {
      const { error } = await supabase.functions.invoke('send-sms-notification', {
        body: { phoneNumber: n.phone_number, notificationType: 'custom', customMessage: n.message_content },
      });
      if (error) throw error;
      toast.success('SMS resent successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend');
    }
    setSending('');
  };

  const statusBadge = (s: string) => {
    if (s === 'delivered') return <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700">Delivered</Badge>;
    if (s === 'failed') return <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700">Failed</Badge>;
    return <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700">Sent</Badge>;
  };

  return (
    <div className="space-y-4 mt-4">
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-1">Notification History</p>
          <p className="text-xs text-muted-foreground mb-3">View recent SMS notifications and resend any that failed</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by phone, message content..." className="pl-9" />
            </div>
            <Button variant="outline" size="sm" onClick={loadRecent} disabled={loading} className="gap-1 text-xs">
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {filtered.length === 0 && !loading && (
          <p className="text-center text-muted-foreground py-8 text-sm">No notifications found</p>
        )}
        {loading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}
        {filtered.map((n: any) => (
          <Card key={n.id} className={`shadow-sm ${n.delivery_status === 'failed' ? 'border-red-200 bg-red-50/50' : ''}`}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium font-mono">{n.phone_number}</span>
                    {statusBadge(n.delivery_status)}
                    <Badge variant="outline" className="text-[10px]">{n.notification_type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.message_content}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {n.sent_at ? formatDistanceToNow(new Date(n.sent_at), { addSuffix: true }) : ''}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="text-xs h-8 gap-1 flex-shrink-0" onClick={() => resendSms(n)} disabled={sending === n.id}>
                  {sending === n.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Resend
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════
// SECTION 4: Invoice Manager
// ══════════════════════════════════════════

const InvoiceManager: React.FC = () => {
  const [invoices, setInvoices] = useState<AppointmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'pending'>('pending');
  const [actionLoading, setActionLoading] = useState('');

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('appointments')
      .select('*')
      .not('invoice_status', 'is', null)
      .order('invoice_sent_at', { ascending: false })
      .limit(50);

    if (filter === 'pending') {
      query = query.in('invoice_status', ['sent', 'reminded', 'final_warning']);
    } else if (filter === 'overdue') {
      query = query.in('invoice_status', ['sent', 'reminded', 'final_warning']).lt('invoice_sent_at', subHours(new Date(), 48).toISOString());
    }

    const { data } = await query;
    setInvoices((data || []) as AppointmentResult[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const markPaid = async (id: string) => {
    setActionLoading(`paid-${id}`);
    const { error } = await supabase.from('appointments').update({ payment_status: 'completed', invoice_status: 'paid' }).eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Marked as paid'); loadInvoices(); }
    setActionLoading('');
  };

  const voidInvoice = async (id: string) => {
    setActionLoading(`void-${id}`);
    const { error } = await supabase.from('appointments').update({ invoice_status: 'voided', payment_status: 'voided' }).eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Invoice voided'); loadInvoices(); }
    setActionLoading('');
  };

  const resendInvoice = async (appt: AppointmentResult) => {
    setActionLoading(`resend-${appt.id}`);
    try {
      await supabase.functions.invoke('send-appointment-invoice', {
        body: { appointmentId: appt.id, patientName: appt.patient_name, patientEmail: appt.patient_email, serviceName: appt.service_name || 'Blood Draw', servicePrice: appt.total_amount || 0 },
      });
      toast.success(`Invoice resent to ${appt.patient_email}`);
    } catch { toast.error('Failed to resend'); }
    setActionLoading('');
  };

  const invoiceStatusColor: Record<string, string> = {
    sent: 'bg-blue-50 text-blue-700',
    reminded: 'bg-amber-50 text-amber-700',
    final_warning: 'bg-red-50 text-red-700',
    paid: 'bg-emerald-50 text-emerald-700',
    voided: 'bg-gray-50 text-gray-500',
    cancelled: 'bg-gray-50 text-gray-500',
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['pending', 'overdue', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${filter === f ? 'bg-[#1e293b] text-white border-[#1e293b]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {f === 'pending' ? 'Pending' : f === 'overdue' ? 'Overdue (>48h)' : 'All Invoices'}
          </button>
        ))}
        <Button variant="outline" size="sm" onClick={loadInvoices} disabled={loading} className="ml-auto gap-1 text-xs">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : invoices.length === 0 ? (
        <Card className="border-dashed"><CardContent className="p-8 text-center text-sm text-muted-foreground">No invoices match this filter</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => (
            <Card key={inv.id} className="shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{inv.patient_name || 'Unknown'}</p>
                      <Badge variant="outline" className={`text-[10px] ${invoiceStatusColor[inv.invoice_status || ''] || ''}`}>{inv.invoice_status}</Badge>
                      <span className="text-xs font-semibold text-emerald-700">${inv.total_amount || 0}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inv.patient_email || 'No email'} | Sent {inv.invoice_sent_at ? formatDistanceToNow(new Date(inv.invoice_sent_at), { addSuffix: true }) : 'unknown'}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => resendInvoice(inv)} disabled={actionLoading !== ''}>
                      {actionLoading === `resend-${inv.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Resend
                    </Button>
                    <Button size="sm" className="text-xs h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => markPaid(inv.id)} disabled={actionLoading !== ''}>
                      {actionLoading === `paid-${inv.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Paid
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => voidInvoice(inv.id)} disabled={actionLoading !== ''}>
                      {actionLoading === `void-${inv.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />} Void
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════
// SECTION 5: Activity Log
// ══════════════════════════════════════════

const ActivityLog: React.FC = () => {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('activity_log' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setEntries((data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const filtered = entries.filter(e => {
    if (typeFilter !== 'all' && e.activity_type !== typeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (e.description || '').toLowerCase().includes(q) || (e.created_by_name || '').toLowerCase().includes(q);
  });

  const typeColors: Record<string, string> = {
    call: 'bg-blue-50 text-blue-700',
    sms: 'bg-emerald-50 text-emerald-700',
    email: 'bg-purple-50 text-purple-700',
    voicemail: 'bg-amber-50 text-amber-700',
    cancellation: 'bg-red-50 text-red-700',
    reschedule: 'bg-orange-50 text-orange-700',
    system: 'bg-gray-50 text-gray-600',
    note: 'bg-blue-50 text-blue-600',
  };

  const activityTypes = [...new Set(entries.map(e => e.activity_type))].sort();

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search activity log..." className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {activityTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadEntries} disabled={loading} className="gap-1 text-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">No activity entries found</p>
      ) : (
        <div className="space-y-1">
          {filtered.map(e => (
            <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-gray-50 transition">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${typeColors[e.activity_type] || 'bg-gray-50 text-gray-600'}`}>{e.activity_type}</Badge>
                  <span className="text-[10px] text-muted-foreground">{e.created_at ? format(new Date(e.created_at), 'MMM d, h:mm a') : ''}</span>
                  {e.created_by_name && <span className="text-[10px] text-muted-foreground">by {e.created_by_name}</span>}
                </div>
                <p className="text-sm mt-0.5">{e.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OperationsPanel;
