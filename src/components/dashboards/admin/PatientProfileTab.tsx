import React, { useState, useEffect, useCallback } from 'react';
import MembershipActionsModal from './MembershipActionsModal';
import StaffRefundButton from '@/components/admin/StaffRefundButton';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  User, Phone, Mail, Calendar, Clock, MapPin, Shield, FileText,
  Search, ArrowLeft, Package, ClipboardList, DollarSign, Stethoscope,
  ChevronRight, Edit3, CalendarPlus, Receipt, MessageSquare, MoreHorizontal, UserPlus, Loader2,
  Crown,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import AddressAutocomplete from '@/components/ui/address-autocomplete';
import { useBookingModalSafe } from '@/contexts/BookingModalContext';
import RecurringGapsCard from './RecurringGapsCard';

const PatientProfileTab: React.FC = () => {
  const bookingModal = useBookingModalSafe();
  const [searchQuery, setSearchQuery] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [referringProvider, setReferringProvider] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [specimens, setSpecimens] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '', dob: '', address: '', city: '', state: '', zipcode: '', gateCode: '', insuranceProvider: '', insuranceMemberId: '', insuranceGroup: '' });
  const [savingPatient, setSavingPatient] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    amount: '',
    description: '',
    memo: '',
    // New: explicit payer routing — patient (default) or organization.
    // Prevents the Hormozi "ambiguous money-destination button" revenue leak.
    recipient: 'patient' as 'patient' | 'organization',
    // New: attach invoice to an existing appointment instead of creating a
    // phantom. Empty string = create standalone invoice (old behavior).
    attachAppointmentId: '' as string,
    // New: when recipient='organization', admin can pick which org to bill.
    // Defaults to the attached appointment's org if one is chosen.
    orgId: '' as string,
  });
  const [allOrgs, setAllOrgs] = useState<any[]>([]);
  const [createPatientOpen, setCreatePatientOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({ firstName: '', lastName: '', email: '', phone: '', dob: '', address: '', city: '', state: 'FL', zipcode: '', insuranceProvider: '', insuranceMemberId: '', insuranceGroup: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [patientsWithAppts, setPatientsWithAppts] = useState<Set<string>>(new Set());
  // Map of user_id -> membership tier label ('member', 'vip', 'concierge').
  // Used to show the crown icon + tier next to member patients.
  const [memberTiers, setMemberTiers] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<'all' | 'dormant' | 'incomplete' | 'members'>('all');

  // Load orgs once so the invoice modal can let admin pick a billable org
  useEffect(() => {
    supabase.from('organizations').select('id, name, billing_email, contact_email, default_billed_to, org_invoice_price_cents, locked_price_cents')
      .eq('is_active', true).order('name')
      .then(({ data }) => setAllOrgs(data || []));
  }, []);

  // Load all patients + appointment activity + active memberships on mount
  useEffect(() => {
    const loadAll = async () => {
      const [{ data: pts }, { data: appts }, { data: mems }] = await Promise.all([
        supabase.from('tenant_patients').select('*').eq('is_active', true).is('deleted_at', null).order('first_name', { ascending: true }).limit(1000),
        supabase.from('appointments').select('patient_id').not('patient_id', 'is', null),
        supabase.from('user_memberships' as any)
          .select('user_id, status, membership_plans(name)')
          .eq('status', 'active'),
      ]);
      const activeIds = new Set<string>();
      for (const a of appts || []) if (a.patient_id) activeIds.add(a.patient_id);
      const tiers = new Map<string, string>();
      for (const m of (mems as any[]) || []) {
        const planName = String(m?.membership_plans?.name || '').toLowerCase();
        let tier = 'member';
        if (planName.includes('concierge')) tier = 'concierge';
        else if (planName.includes('vip')) tier = 'vip';
        if (m.user_id) tiers.set(m.user_id, tier);
      }
      setAllPatients(pts || []);
      setPatients(pts || []);
      setPatientsWithAppts(activeIds);
      setMemberTiers(tiers);
    };
    loadAll();
  }, []);

  // Filter patients as user types + filter chip
  useEffect(() => {
    let list = allPatients;
    if (filter === 'dormant') {
      list = list.filter(p => !patientsWithAppts.has(p.id));
    } else if (filter === 'incomplete') {
      list = list.filter(p => !p.address || p.address.trim() === '');
    } else if (filter === 'members') {
      list = list.filter(p => p.user_id && memberTiers.has(p.user_id));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.phone && p.phone.includes(q))
      );
    }
    setPatients(list);
  }, [searchQuery, allPatients, filter, patientsWithAppts, memberTiers]);

  // Tier → badge color map (Crown icon next to member names)
  const tierBadgeClass = (tier: string | undefined) => {
    switch (tier) {
      case 'concierge': return 'bg-gradient-to-r from-purple-600 to-pink-500 text-white';
      case 'vip': return 'bg-gradient-to-r from-amber-500 to-yellow-400 text-white';
      case 'member': return 'bg-emerald-100 text-emerald-700 border border-emerald-300';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const loadPatientData = useCallback(async (patient: any) => {
    setSelectedPatient(patient);
    setLoading(true);

    // Fetch referring provider info — shows "Referred by Dr. X at Practice Y"
    // at the top of the chart so every conversation starts warmer.
    if (patient.email) {
      const { data: refs } = await supabase
        .from('patient_referring_providers')
        .select('provider_name, practice_name, practice_city, status, matched_org_id, converted_at')
        .ilike('patient_email', patient.email)
        .order('discovered_at', { ascending: false })
        .limit(1);
      setReferringProvider(refs && refs.length > 0 ? refs[0] : null);
    } else {
      setReferringProvider(null);
    }

    // Fetch appointments
    const { data: appts } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_id', patient.id)
      .order('appointment_date', { ascending: false });
    setAppointments(appts || []);

    // Fetch specimens
    const { data: specs } = await supabase
      .from('specimen_deliveries' as any)
      .select('*')
      .eq('patient_id', patient.id)
      .order('delivered_at', { ascending: false });
    setSpecimens((specs as any[]) || []);

    // Fetch activity log
    const { data: acts } = await supabase
      .from('activity_log' as any)
      .select('*')
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false });
    setActivities((acts as any[]) || []);

    setLoading(false);
  }, []);

  const STATUS_COLORS: Record<string, string> = {
    scheduled: 'bg-blue-50 text-blue-700',
    confirmed: 'bg-emerald-50 text-emerald-700',
    en_route: 'bg-amber-50 text-amber-700',
    in_progress: 'bg-purple-50 text-purple-700',
    completed: 'bg-gray-50 text-gray-600',
    cancelled: 'bg-red-50 text-red-700',
    specimen_delivered: 'bg-indigo-50 text-indigo-700',
  };

  // Patient profile view
  if (selectedPatient) {
    const p = selectedPatient;
    const upcomingAppts = appointments.filter(a => ['scheduled', 'confirmed'].includes(a.status));
    const pastAppts = appointments.filter(a => ['completed', 'specimen_delivered'].includes(a.status));
    const cancelledAppts = appointments.filter(a => a.status === 'cancelled');
    const totalSpent = appointments.filter(a => a.payment_status === 'completed').reduce((s, a) => s + (a.total_amount || 0), 0);

    return (
      <div className="space-y-6">
        {/* Back + Header + Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSelectedPatient(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{p.first_name} {p.last_name}</h1>
                {p.user_id && memberTiers.has(p.user_id) && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${tierBadgeClass(memberTiers.get(p.user_id))}`}>
                    <Crown className="h-3 w-3" /> {memberTiers.get(p.user_id)}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Patient Chart</p>

              {/* Referring-provider badge — context for every conversation */}
              {referringProvider && (referringProvider.provider_name || referringProvider.practice_name) && (
                <div className={`inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-md text-[11px] border ${
                  referringProvider.status === 'converted'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : referringProvider.status === 'unsubscribed' || referringProvider.status === 'declined'
                    ? 'bg-gray-50 border-gray-200 text-gray-500'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                  <span className="font-semibold">Referred by:</span>
                  <span>
                    {referringProvider.provider_name ? `${referringProvider.provider_name}` : ''}
                    {referringProvider.provider_name && referringProvider.practice_name ? ' · ' : ''}
                    {referringProvider.practice_name || ''}
                    {referringProvider.practice_city ? ` (${referringProvider.practice_city})` : ''}
                  </span>
                  {referringProvider.status === 'converted' && (
                    <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-full font-semibold">✓ Active partner</span>
                  )}
                  {referringProvider.status === 'contacted' && (
                    <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-semibold">In sequence</span>
                  )}
                  {referringProvider.status === 'unsubscribed' && (
                    <span className="text-[10px] bg-gray-400 text-white px-1.5 py-0.5 rounded-full font-semibold">Unsubscribed</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-10 sm:pl-0">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => {
              setEditForm({ firstName: p.first_name || '', lastName: p.last_name || '', email: p.email || '', phone: p.phone || '', dob: p.date_of_birth || '', address: p.address || '', city: p.city || '', state: p.state || '', zipcode: p.zipcode || '', gateCode: p.gate_code || '', insuranceProvider: p.insurance_provider || '', insuranceMemberId: p.insurance_member_id || '', insuranceGroup: p.insurance_group_number || '' });
              setEditModalOpen(true);
            }}>
              <Edit3 className="h-3.5 w-3.5" /> Edit Info
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => {
              // Stash patient prefill for BookingFlow to consume on mount
              // (cleared after one consumption to avoid leaking to next session).
              // Hormozi: every click that doesn't serve the patient is waste —
              // admin-booking-for-patient should NOT require retyping their info.
              try {
                sessionStorage.setItem('convelabs_admin_prefill_patient', JSON.stringify({
                  firstName: p.first_name || '',
                  lastName: p.last_name || '',
                  email: p.email || '',
                  phone: p.phone || '',
                  address: p.address || '',
                  city: p.city || '',
                  state: p.state || 'FL',
                  zipCode: p.zipcode || '',
                  gateCode: p.gate_code || '',
                  patientId: p.id,
                  insuranceProvider: p.insurance_provider || '',
                  insuranceMemberId: p.insurance_member_id || '',
                }));
              } catch (e) { /* non-blocking */ }

              // Open the in-app booking modal (overlays admin UI) instead of
              // navigating away. Previous code redirected to the public
              // calendar page which dumped the admin into the patient-facing
              // booking flow — wrong context entirely.
              if (bookingModal?.openModal) {
                bookingModal.openModal('admin_patient_chart');
              } else {
                toast.error('Booking modal not available in this context');
              }
            }}>
              <CalendarPlus className="h-3.5 w-3.5" /> Schedule
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => {
              setInvoiceForm({ amount: '', description: '', memo: '' });
              setInvoiceModalOpen(true);
            }}>
              <Receipt className="h-3.5 w-3.5" /> Generate Invoice
            </Button>
            {p.phone && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => window.open(`sms:${p.phone}`)}>
                <MessageSquare className="h-3.5 w-3.5" /> Message
              </Button>
            )}
            {/* Membership upgrade — only show if patient isn't already a member */}
            {p.email && !(p.user_id && memberTiers.has(p.user_id)) && (
              <Button
                size="sm"
                className="gap-1.5 text-xs bg-[#B91C1C] hover:bg-[#991B1B] text-white"
                onClick={() => setShowMembershipModal(true)}
              >
                <Sparkles className="h-3.5 w-3.5" /> Membership
              </Button>
            )}
          </div>
        </div>

        {/* Membership offer / registration modal */}
        <MembershipActionsModal
          open={showMembershipModal}
          onClose={() => setShowMembershipModal(false)}
          patientEmail={p.email || ''}
          patientName={`${p.first_name || ''} ${p.last_name || ''}`.trim()}
          onSuccess={() => loadPatientData(p)}
        />

        {/* Recurring-series gap detector — only renders if gaps exist. */}
        <RecurringGapsCard patientId={p.id} onGapsFilled={() => loadPatientData(p)} />

        {/* Patient Info Card */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-[#B91C1C]/10 flex items-center justify-center">
                    <User className="h-7 w-7 text-[#B91C1C]" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">{p.first_name} {p.last_name}</p>
                    {p.date_of_birth && <p className="text-xs text-muted-foreground">DOB: {p.date_of_birth}</p>}
                  </div>
                </div>
                {p.email && <p className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /> {p.email}</p>}
                {p.phone && <p className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /> {p.phone}</p>}
                {(() => {
                  const line1 = selectedPatient.address || '';
                  const line2 = [selectedPatient.city, selectedPatient.state, selectedPatient.zipcode].filter(Boolean).join(', ');
                  const tpAddr = [line1, line2].filter(Boolean).join(', ');
                  const latestWithAddress = appointments.find(a => a.address && a.address !== 'Pending');
                  const displayAddress = tpAddr || latestWithAddress?.address || null;
                  if (displayAddress) {
                    return (
                      <p className="flex items-start gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span>{displayAddress}</span>
                      </p>
                    );
                  }
                  return (
                    <p className="flex items-start gap-2 text-sm text-amber-700">
                      <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>No address on file — click Edit Info to add</span>
                    </p>
                  );
                })()}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold flex items-center gap-1.5"><Shield className="h-4 w-4" /> Insurance</p>
                {p.insurance_provider ? (
                  <>
                    <p className="text-sm">{p.insurance_provider}</p>
                    {p.insurance_member_id && <p className="text-xs text-muted-foreground">Member ID: {p.insurance_member_id}</p>}
                    {p.insurance_group_number && <p className="text-xs text-muted-foreground">Group: {p.insurance_group_number}</p>}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Self-pay (no insurance on file)</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">{appointments.length}</p>
                  <p className="text-[10px] text-muted-foreground">Total Visits</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-emerald-700">${totalSpent}</p>
                  <p className="text-[10px] text-muted-foreground">Total Spent</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-purple-700">{specimens.length}</p>
                  <p className="text-[10px] text-muted-foreground">Specimens</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-amber-700">{upcomingAppts.length}</p>
                  <p className="text-[10px] text-muted-foreground">Upcoming</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="appointments">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
            <TabsTrigger value="appointments">Appointments ({appointments.length})</TabsTrigger>
            <TabsTrigger value="specimens">Specimens ({specimens.length})</TabsTrigger>
            <TabsTrigger value="notes">Notes ({activities.length})</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>

          <TabsContent value="appointments" className="space-y-3 mt-4">
            {upcomingAppts.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 text-blue-700">Upcoming ({upcomingAppts.length})</p>
                {upcomingAppts.map(a => (
                  <Card key={a.id} className="shadow-sm mb-2">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[a.status] || ''}`}>{a.status}</Badge>
                          <span className="text-sm font-medium">{a.appointment_date?.substring(0, 10) ? format(new Date(a.appointment_date.substring(0, 10) + 'T12:00:00'), 'MMM d, yyyy') : ''}</span>
                          <span className="text-xs text-muted-foreground">{a.appointment_time || ''}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">{(a.service_name || a.service_type || '').replace(/_|-/g, ' ')}</p>
                        {a.address && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.address}</p>}
                        {a.gate_code && <p className="text-xs text-amber-600">Gate: {a.gate_code}</p>}
                      </div>
                      <span className="text-sm font-medium">${a.total_amount || 0}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {pastAppts.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 text-gray-600">Past ({pastAppts.length})</p>
                {pastAppts.map(a => (
                  <Card key={a.id} className="shadow-sm mb-2 opacity-75">
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-600">{a.status}</Badge>
                          <span className="text-sm">{a.appointment_date?.substring(0, 10) ? format(new Date(a.appointment_date.substring(0, 10) + 'T12:00:00'), 'MMM d, yyyy') : ''}</span>
                          {(a.refunded_at || a.refund_status === 'refunded') && (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Refunded</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">{(a.service_type || '').replace(/_|-/g, ' ')}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-medium">${a.total_amount || 0}</span>
                        {a.payment_status === 'completed' && (a.total_amount || 0) > 0 && (
                          <StaffRefundButton
                            appointmentId={a.id}
                            patientEmail={p.email}
                            patientName={`${p.first_name || ''} ${p.last_name || ''}`.trim()}
                            totalAmountDollars={a.total_amount || 0}
                            alreadyRefunded={!!a.refunded_at || a.refund_status === 'refunded'}
                            refundedAmountCents={a.refund_amount_cents}
                            onRefunded={() => loadPatientData(p)}
                          />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {cancelledAppts.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 text-red-600">Cancelled ({cancelledAppts.length})</p>
                {cancelledAppts.map(a => (
                  <Card key={a.id} className="shadow-sm mb-2 opacity-50">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700">cancelled</Badge>
                        <span className="text-sm ml-2">{a.appointment_date?.substring(0, 10) ? format(new Date(a.appointment_date.substring(0, 10) + 'T12:00:00'), 'MMM d') : ''}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {appointments.length === 0 && <p className="text-center text-muted-foreground py-8">No appointments found</p>}
          </TabsContent>

          <TabsContent value="specimens" className="mt-4">
            {specimens.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No specimens recorded</p>
            ) : (
              <div className="space-y-2">
                {specimens.map((s: any) => (
                  <Card key={s.id} className="shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono font-medium text-sm">{s.specimen_id}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px]">{s.lab_name}</Badge>
                            <span className="text-xs text-muted-foreground">{s.tube_count} tube{s.tube_count !== 1 ? 's' : ''}{s.tube_types ? ` (${s.tube_types})` : ''}</span>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">{s.delivered_at ? format(new Date(s.delivered_at), 'MMM d, h:mm a') : ''}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            {activities.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No activity notes for this patient</p>
            ) : (
              <div className="space-y-2">
                {activities.map((a: any) => (
                  <div key={a.id} className="flex gap-3 p-3 rounded-lg border">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <ClipboardList className="h-4 w-4 text-gray-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{a.activity_type}</Badge>
                        <span className="text-[10px] text-muted-foreground">{a.created_at ? format(new Date(a.created_at), 'MMM d, h:mm a') : ''}</span>
                      </div>
                      <p className="text-sm mt-1">{a.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="billing" className="mt-4">
            <Card className="shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Appointments</span><span className="font-medium">{appointments.length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Paid Appointments</span><span className="font-medium">{appointments.filter(a => a.payment_status === 'completed').length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Revenue</span><span className="font-bold text-emerald-700">${totalSpent}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Tips</span><span className="font-medium">${appointments.reduce((s, a) => s + (a.tip_amount || 0), 0)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Outstanding</span><span className="font-medium text-red-600">${appointments.filter(a => a.payment_status !== 'completed' && a.status !== 'cancelled').reduce((s, a) => s + (a.total_amount || 0), 0)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Insurance</span><span>{p.insurance_provider || 'Self-pay'}</span></div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Patient Modal — Square "Edit Customer" style */}
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-lg font-bold text-center">Edit Customer</DialogTitle></DialogHeader>
            <div className="divide-y">
              {/* Name */}
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-start sm:items-center py-3 gap-1 sm:gap-3">
                <Label className="text-sm font-semibold text-gray-600">First Name</Label>
                <Input value={editForm.firstName} onChange={e => setEditForm(pr => ({ ...pr, firstName: e.target.value }))} className="h-9" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-start sm:items-center py-3 gap-1 sm:gap-3">
                <Label className="text-sm font-semibold text-gray-600">Last Name</Label>
                <Input value={editForm.lastName} onChange={e => setEditForm(pr => ({ ...pr, lastName: e.target.value }))} className="h-9" />
              </div>
              {/* Birthday */}
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-start sm:items-center py-3 gap-1 sm:gap-3">
                <Label className="text-sm font-semibold text-gray-600">Birthday</Label>
                <Input type="date" value={editForm.dob} onChange={e => setEditForm(pr => ({ ...pr, dob: e.target.value }))} className="h-9" />
              </div>
              {/* Address */}
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-start py-3 gap-1 sm:gap-3">
                <Label className="text-sm font-semibold text-gray-600 sm:mt-2">Address</Label>
                <div className="space-y-2">
                  <AddressAutocomplete
                    value={editForm.address}
                    onChange={v => setEditForm(pr => ({ ...pr, address: v }))}
                    onPlaceSelected={(place) => {
                      // Use street-only in Address — City/State/Zip are separate fields below.
                      setEditForm(pr => ({ ...pr, address: place.street || place.address, city: place.city || pr.city, state: place.state || pr.state, zipcode: place.zipCode || pr.zipcode }));
                    }}
                    placeholder="Start typing address — Google suggestions"
                    className="h-9"
                  />
                  <Input value={editForm.city} onChange={e => setEditForm(pr => ({ ...pr, city: e.target.value }))} placeholder="City" className="h-9" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editForm.state} onChange={e => setEditForm(pr => ({ ...pr, state: e.target.value }))} placeholder="State" maxLength={2} className="h-9" />
                    <Input value={editForm.zipcode} onChange={e => setEditForm(pr => ({ ...pr, zipcode: e.target.value }))} placeholder="ZIP" className="h-9" />
                  </div>
                </div>
              </div>
              {/* Gate Code */}
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-start sm:items-center py-3 gap-1 sm:gap-3">
                <Label className="text-sm font-semibold text-gray-600">Gate Code</Label>
                <Input value={editForm.gateCode} onChange={e => setEditForm(pr => ({ ...pr, gateCode: e.target.value }))} placeholder="Gate Code" className="h-9" />
              </div>
              {/* Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-start sm:items-center py-3 gap-1 sm:gap-3">
                <Label className="text-sm font-semibold text-gray-600">Phone Number</Label>
                <Input value={editForm.phone} onChange={e => setEditForm(pr => ({ ...pr, phone: e.target.value }))} className="h-9" />
              </div>
              {/* Email */}
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-start sm:items-center py-3 gap-1 sm:gap-3">
                <Label className="text-sm font-semibold text-gray-600">Email Address</Label>
                <Input type="email" value={editForm.email} onChange={e => setEditForm(pr => ({ ...pr, email: e.target.value }))} className="h-9" />
              </div>
              {/* Insurance */}
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-start py-3 gap-1 sm:gap-3">
                <Label className="text-sm font-semibold text-gray-600 text-[#B91C1C]">Insurance Courier &amp; Member ID</Label>
                <div className="space-y-2">
                  <Input value={editForm.insuranceProvider} onChange={e => setEditForm(pr => ({ ...pr, insuranceProvider: e.target.value }))} placeholder="Insurance provider" className="h-9 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editForm.insuranceMemberId} onChange={e => setEditForm(pr => ({ ...pr, insuranceMemberId: e.target.value }))} placeholder="Member ID" className="h-9" />
                    <Input value={editForm.insuranceGroup} onChange={e => setEditForm(pr => ({ ...pr, insuranceGroup: e.target.value }))} placeholder="Group #" className="h-9" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center gap-3 pt-4 border-t mt-2">
              {/* Danger zone — delete. Soft-deletes by default; server decides
                  hard vs soft based on whether the patient has any history. */}
              <Button
                variant="outline"
                className="h-10 px-4 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  // eslint-disable-next-line no-console
                  console.log('[delete-patient] click fired for', p.id, `${p.first_name} ${p.last_name}`);

                  const reason = window.prompt(
                    `Delete patient "${p.first_name} ${p.last_name}"?\n\n` +
                    `Patients with appointment history are SOFT-deleted (hidden but audit-preserved for HIPAA).\n` +
                    `Patients with no history are removed permanently.\n\n` +
                    `Enter a short reason (min 3 chars):`
                  );
                  if (!reason || reason.trim().length < 3) {
                    console.log('[delete-patient] cancelled — no/short reason');
                    return;
                  }

                  // Verify caller's role from JWT so we can explain failures
                  const { data: sess } = await supabase.auth.getSession();
                  const role = (sess?.session?.user?.user_metadata as any)?.role
                    || (sess?.session?.user?.app_metadata as any)?.role
                    || 'unknown';
                  const uid = sess?.session?.user?.id || 'no-session';
                  console.log('[delete-patient] calling RPC as', { uid, role });

                  try {
                    const { data, error } = await supabase.rpc('delete_patient', {
                      p_patient_id: p.id,
                      p_reason: reason.trim(),
                      p_hard_delete: true,
                    });

                    console.log('[delete-patient] RPC response', { data, error });

                    if (error) {
                      const details = `code=${(error as any).code || 'n/a'} · ${error.message || 'no message'}${(error as any).hint ? ' · hint: ' + (error as any).hint : ''} · role=${role}`;
                      toast.error(`Delete failed: ${details}`, { duration: 12000 });
                      return;
                    }
                    if ((data as any)?.action === 'hard_delete') {
                      toast.success('Patient permanently deleted (no history)');
                    } else {
                      toast.success(`Patient soft-deleted${(data as any)?.note ? ` · ${(data as any).note}` : ''}`);
                    }
                    setEditModalOpen(false);
                    const { data: refreshed, error: refErr } = await supabase
                      .from('tenant_patients').select('*').is('deleted_at', null)
                      .order('first_name').limit(500);
                    if (refErr) {
                      console.error('[delete-patient] refresh failed', refErr);
                      toast.warning('Delete succeeded but list refresh failed — reload the page');
                    } else {
                      setAllPatients(refreshed || []);
                    }
                    setSelectedPatient(null);
                  } catch (err: any) {
                    console.error('[delete-patient] threw', err);
                    toast.error(`Delete crashed: ${err?.message || String(err)}`, { duration: 12000 });
                  }
                }}
              >
                Delete Patient
              </Button>
              <div className="flex gap-3">
              <Button variant="outline" onClick={() => setEditModalOpen(false)} className="h-10 px-6">Cancel</Button>
              <Button
                type="button"
                disabled={savingPatient}
                className="h-10 px-6 bg-[#1e293b] hover:bg-[#0f172a] text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (savingPatient) return;
                setSavingPatient(true);
                console.log('[patient-save] click fired for', p.id, 'email:', editForm.email);
                try {
                  const updatePayload: any = {
                    first_name: editForm.firstName, last_name: editForm.lastName,
                    email: editForm.email, phone: editForm.phone, date_of_birth: editForm.dob || null,
                    address: editForm.address || null,
                    city: editForm.city || null,
                    state: editForm.state || null,
                    zipcode: editForm.zipcode || null,
                    gate_code: editForm.gateCode || null,
                    insurance_provider: editForm.insuranceProvider || null,
                    insurance_member_id: editForm.insuranceMemberId || null,
                    insurance_group_number: editForm.insuranceGroup || null,
                  };
                  console.log('[patient-save] payload:', updatePayload);
                  const { data, error } = await supabase.from('tenant_patients').update(updatePayload).eq('id', p.id).select();
                  console.log('[patient-save] response:', { data, error });

                  if (error) {
                    console.error('[patient-save] DB error:', error);
                    toast.error(
                      `Update failed — code ${error.code || 'n/a'}: ${error.message || 'no message'}${error.hint ? ` · hint: ${error.hint}` : ''}`,
                      { duration: 12000 }
                    );
                    return;
                  }
                  if (!data || data.length === 0) {
                    // Diagnose role for the user
                    const { data: { session } } = await supabase.auth.getSession();
                    const role = (session?.user as any)?.user_metadata?.role || 'unknown';
                    toast.error(
                      `Update returned 0 rows — likely a permissions issue. You're signed in as: ${role}. Need super_admin / admin / office_manager.`,
                      { duration: 12000 }
                    );
                    return;
                  }
                  toast.success('Patient info updated');
                  setSelectedPatient({
                    ...p,
                    first_name: editForm.firstName, last_name: editForm.lastName,
                    email: editForm.email, phone: editForm.phone,
                    date_of_birth: editForm.dob || null,
                    address: editForm.address || null, city: editForm.city || null, state: editForm.state || null, zipcode: editForm.zipcode || null,
                    gate_code: editForm.gateCode || null,
                    insurance_provider: editForm.insuranceProvider || null, insurance_member_id: editForm.insuranceMemberId || null, insurance_group_number: editForm.insuranceGroup || null,
                  });
                  setEditModalOpen(false);
                  try {
                    const { data: refreshed } = await supabase.from('tenant_patients').select('*').is('deleted_at', null).order('first_name').limit(500);
                    setAllPatients(refreshed || []);
                  } catch (refreshErr: any) {
                    console.warn('[patient-save] refresh failed (save itself OK):', refreshErr);
                    toast.warning('Saved, but list refresh failed — reload to see the latest.');
                  }
                } catch (err: any) {
                  console.error('[patient-save] threw:', err);
                  toast.error(
                    `Save crashed: ${err?.message || String(err)}. Open DevTools Console for the full trace.`,
                    { duration: 12000 }
                  );
                } finally {
                  setSavingPatient(false);
                }
              }}>{savingPatient ? 'Saving…' : 'Save Changes'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Generate Invoice — attach to existing appointment OR standalone,
            route to patient OR organization. Hormozi rule: make the money
            destination explicit on every screen that touches money. */}
        <Dialog open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
          <DialogContent className="max-w-md w-[95vw] sm:w-full">
            <DialogHeader><DialogTitle>Generate Invoice for {p.first_name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {/* Attach to existing appointment (optional) */}
              <div>
                <Label className="text-xs">Attach to appointment <span className="text-gray-400 font-normal">(optional — leave blank for standalone)</span></Label>
                <select
                  value={invoiceForm.attachAppointmentId}
                  onChange={(e) => {
                    const apptId = e.target.value;
                    const appt = appointments.find(a => a.id === apptId);
                    setInvoiceForm(pr => ({
                      ...pr,
                      attachAppointmentId: apptId,
                      // Pre-fill amount + description from the appointment when chosen
                      amount: appt ? String(appt.total_amount || appt.service_price || '') : pr.amount,
                      description: appt ? (appt.service_name || appt.service_type || '') : pr.description,
                      // If appt has an org linked, default recipient to org
                      recipient: appt?.organization_id ? 'organization' : pr.recipient,
                      orgId: appt?.organization_id || pr.orgId,
                    }));
                  }}
                  className="mt-1 w-full h-9 text-sm border rounded-md px-2 bg-white"
                >
                  <option value="">— Create new / standalone invoice —</option>
                  {appointments.filter(a => a.payment_status !== 'completed').map(a => (
                    <option key={a.id} value={a.id}>
                      {a.appointment_date?.substring(0, 10)} · {a.service_name || a.service_type} · ${Number(a.total_amount || 0).toFixed(2)} · {a.payment_status}
                    </option>
                  ))}
                </select>
              </div>

              {/* Recipient picker — Patient vs Organization */}
              <div>
                <Label className="text-xs">Send invoice to *</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button type="button"
                    onClick={() => setInvoiceForm(pr => ({ ...pr, recipient: 'patient' }))}
                    className={`text-left p-2 rounded border-2 text-sm ${invoiceForm.recipient === 'patient' ? 'border-[#B91C1C] bg-red-50' : 'border-gray-200'}`}>
                    <span className="block font-semibold">Patient</span>
                    <span className="block text-[11px] text-gray-500 truncate">{p.email || 'no email on file'}</span>
                  </button>
                  <button type="button"
                    onClick={() => setInvoiceForm(pr => ({ ...pr, recipient: 'organization' }))}
                    className={`text-left p-2 rounded border-2 text-sm ${invoiceForm.recipient === 'organization' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
                    <span className="block font-semibold">Organization</span>
                    <span className="block text-[11px] text-gray-500">Bill a partner practice</span>
                  </button>
                </div>
              </div>

              {/* Org picker only shown when recipient = organization */}
              {invoiceForm.recipient === 'organization' && (
                <div>
                  <Label className="text-xs">Organization *</Label>
                  <select
                    value={invoiceForm.orgId}
                    onChange={(e) => setInvoiceForm(pr => ({ ...pr, orgId: e.target.value }))}
                    className="mt-1 w-full h-9 text-sm border rounded-md px-2 bg-white">
                    <option value="">— Select organization —</option>
                    {allOrgs.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.name} {o.billing_email ? `· ${o.billing_email}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Amount ($) *</Label><Input type="number" min="0" step="0.01" value={invoiceForm.amount} onChange={e => setInvoiceForm(pr => ({ ...pr, amount: e.target.value }))} placeholder="150.00" /></div>
                <div><Label className="text-xs">Service</Label><Input value={invoiceForm.description} onChange={e => setInvoiceForm(pr => ({ ...pr, description: e.target.value }))} placeholder="Blood Draw" /></div>
              </div>
              <div><Label className="text-xs">Memo</Label><Input value={invoiceForm.memo} onChange={e => setInvoiceForm(pr => ({ ...pr, memo: e.target.value }))} placeholder="Optional notes" /></div>

              {(() => {
                const selectedOrg = allOrgs.find(o => o.id === invoiceForm.orgId);
                const recipientEmail = invoiceForm.recipient === 'organization'
                  ? (selectedOrg?.billing_email || selectedOrg?.contact_email || '')
                  : (p.email || '');
                return (
                  <p className={`text-xs ${recipientEmail ? 'text-muted-foreground' : 'text-red-600'}`}>
                    Invoice will be sent to <strong>{recipientEmail || 'NO EMAIL ON FILE — pick a recipient with an email'}</strong>
                    {invoiceForm.attachAppointmentId && <span className="block text-emerald-700 mt-1">✓ Attached to existing appointment</span>}
                  </p>
                );
              })()}

              <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white"
                disabled={(() => {
                  if (!invoiceForm.amount) return true;
                  if (invoiceForm.recipient === 'patient' && !p.email) return true;
                  if (invoiceForm.recipient === 'organization' && !invoiceForm.orgId) return true;
                  return false;
                })()}
                onClick={async () => {
                  try {
                    const amount = parseFloat(invoiceForm.amount);
                    const selectedOrg = allOrgs.find(o => o.id === invoiceForm.orgId);
                    const recipientEmail = invoiceForm.recipient === 'organization'
                      ? (selectedOrg?.billing_email || selectedOrg?.contact_email || '')
                      : (p.email || '');
                    const recipientName = invoiceForm.recipient === 'organization'
                      ? (selectedOrg?.name || 'Organization')
                      : `${p.first_name} ${p.last_name}`;

                    let appointmentId = invoiceForm.attachAppointmentId;

                    // Case A: attach to existing appointment — update its invoice columns
                    if (appointmentId) {
                      const { error: updateErr } = await supabase.from('appointments').update({
                        total_amount: amount,
                        service_price: amount,
                        invoice_status: 'sent',
                        invoice_sent_at: new Date().toISOString(),
                        invoice_due_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
                        payment_status: 'pending',
                        billed_to: invoiceForm.recipient === 'organization' ? 'org' : 'patient',
                        ...(invoiceForm.recipient === 'organization' && invoiceForm.orgId ? { organization_id: invoiceForm.orgId } : {}),
                        notes: invoiceForm.memo || null,
                      }).eq('id', appointmentId);
                      if (updateErr) throw updateErr;
                    } else {
                      // Case B: standalone placeholder appointment (old behavior, but now org-aware)
                      const { data: appt, error } = await supabase.from('appointments').insert([{
                        appointment_date: new Date().toISOString(), patient_id: p.id,
                        patient_name: `${p.first_name} ${p.last_name}`, patient_email: p.email || null,
                        service_type: 'invoice', service_name: invoiceForm.description || 'Invoice',
                        status: 'scheduled', address: 'Invoice Only', zipcode: '32801',
                        total_amount: amount, service_price: amount, booking_source: 'manual',
                        invoice_status: 'sent', invoice_sent_at: new Date().toISOString(),
                        invoice_due_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
                        payment_status: 'pending', notes: invoiceForm.memo || null,
                        billed_to: invoiceForm.recipient === 'organization' ? 'org' : 'patient',
                        ...(invoiceForm.recipient === 'organization' && invoiceForm.orgId ? { organization_id: invoiceForm.orgId } : {}),
                      }]).select().single();
                      if (error) throw error;
                      appointmentId = appt.id;
                    }

                    await supabase.functions.invoke('send-appointment-invoice', {
                      body: {
                        appointmentId,
                        patientName: recipientName,
                        patientEmail: recipientEmail,
                        serviceName: invoiceForm.description || 'ConveLabs Service',
                        servicePrice: amount,
                        memo: invoiceForm.memo || (invoiceForm.recipient === 'organization' ? `Patient: ${p.first_name} ${p.last_name}` : ''),
                        orgName: invoiceForm.recipient === 'organization' ? (selectedOrg?.name || undefined) : undefined,
                      },
                    });
                    toast.success(`Invoice for $${amount.toFixed(2)} sent to ${recipientEmail}`);
                    setInvoiceModalOpen(false);
                    loadPatientData(p);
                  } catch (err: any) { toast.error(err.message || 'Failed'); }
                }}>
                Send Invoice — ${parseFloat(invoiceForm.amount || '0').toFixed(2)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Search view — Square Customer Directory style
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">{allPatients.length.toLocaleString()} total customers in your directory</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="bg-[#1e293b] hover:bg-[#0f172a] text-white gap-1.5 h-9 text-xs" onClick={() => setCreatePatientOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Create
          </Button>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(() => {
            const dormantCount = allPatients.filter(p => !patientsWithAppts.has(p.id)).length;
            const incompleteCount = allPatients.filter(p => !p.address || p.address.trim() === '').length;
            const membersCount = allPatients.filter(p => p.user_id && memberTiers.has(p.user_id)).length;
            return (
              <>
                <button onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${filter === 'all' ? 'bg-[#1e293b] text-white border-[#1e293b]' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'}`}>
                  All ({allPatients.length})
                </button>
                <button onClick={() => setFilter('members')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition inline-flex items-center gap-1 ${filter === 'members' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:bg-gray-50 text-emerald-700 border-emerald-300'}`}>
                  <Crown className="h-3 w-3" /> Members ({membersCount})
                </button>
                <button onClick={() => setFilter('dormant')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${filter === 'dormant' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'}`}>
                  Never Booked ({dormantCount})
                </button>
                <button onClick={() => setFilter('incomplete')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${filter === 'incomplete' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'}`}>
                  Missing Address ({incompleteCount})
                </button>
              </>
            );
          })()}
        </div>
      </div>

      {/* Table */}
      {patients.length > 0 ? (
        <div className="border rounded-lg overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80">
                  <th className="text-left px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wide hidden sm:table-cell">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wide hidden md:table-cell">Phone</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wide hidden lg:table-cell">Birthday</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wide hidden lg:table-cell">Address</th>
                </tr>
              </thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => loadPatientData(p)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-blue-700 hover:underline">{p.first_name} {p.last_name}</span>
                        {p.user_id && memberTiers.has(p.user_id) && (
                          <span
                            title={`${memberTiers.get(p.user_id)} member`}
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${tierBadgeClass(memberTiers.get(p.user_id))}`}
                          >
                            <Crown className="h-2.5 w-2.5" /> {memberTiers.get(p.user_id)}
                          </span>
                        )}
                        {!patientsWithAppts.has(p.id) && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Never booked" />
                        )}
                      </div>
                      {/* Mobile: show email/phone inline */}
                      <div className="sm:hidden text-xs text-muted-foreground mt-0.5">
                        {p.email && <span className="truncate block">{p.email}</span>}
                        {p.phone && <span>{p.phone}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                      <span className="truncate block max-w-[220px]">{p.email || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{p.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                      {p.date_of_birth ? format(new Date(p.date_of_birth + 'T12:00:00'), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                      <span className="truncate block max-w-[200px]">
                        {p.address ? `${p.address}${p.city ? `, ${p.city}` : ''}` : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : searchQuery ? (
        <p className="text-muted-foreground text-center py-8">No patients found matching "{searchQuery}"</p>
      ) : (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#B91C1C] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Create Patient Modal */}
      <Dialog open={createPatientOpen} onOpenChange={setCreatePatientOpen}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-[#B91C1C]" /> Add New Patient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>First Name *</Label><Input value={newPatient.firstName} onChange={e => setNewPatient(p => ({ ...p, firstName: e.target.value }))} placeholder="John" /></div>
              <div><Label>Last Name *</Label><Input value={newPatient.lastName} onChange={e => setNewPatient(p => ({ ...p, lastName: e.target.value }))} placeholder="Smith" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={newPatient.email} onChange={e => setNewPatient(p => ({ ...p, email: e.target.value }))} placeholder="john@email.com" /></div>
              <div><Label>Phone</Label><Input type="tel" value={newPatient.phone} onChange={e => setNewPatient(p => ({ ...p, phone: e.target.value }))} placeholder="4071234567" /></div>
            </div>
            <div><Label>Date of Birth</Label><Input type="date" value={newPatient.dob} onChange={e => setNewPatient(p => ({ ...p, dob: e.target.value }))} /></div>

            <div className="border-t pt-3">
              <p className="text-sm font-semibold mb-2">Address</p>
              <div className="space-y-3">
                <div>
                  <Label>Street</Label>
                  <AddressAutocomplete
                    value={newPatient.address}
                    onChange={v => setNewPatient(p => ({ ...p, address: v }))}
                    onPlaceSelected={(place) => {
                      // Use street-only in Address — City/State/Zip are separate fields below.
                      setNewPatient(p => ({
                        ...p,
                        address: place.street || place.address,
                        city: place.city || p.city,
                        state: place.state || p.state,
                        zipcode: place.zipCode || p.zipcode,
                      }));
                    }}
                    placeholder="Start typing address — Google will suggest"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>City</Label><Input value={newPatient.city} onChange={e => setNewPatient(p => ({ ...p, city: e.target.value }))} placeholder="Orlando" /></div>
                  <div><Label>State</Label><Input value={newPatient.state} onChange={e => setNewPatient(p => ({ ...p, state: e.target.value }))} /></div>
                  <div><Label>ZIP</Label><Input value={newPatient.zipcode} onChange={e => setNewPatient(p => ({ ...p, zipcode: e.target.value }))} placeholder="32801" /></div>
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-semibold mb-2">Insurance</p>
              <div className="space-y-3">
                <div><Label>Provider</Label><Input value={newPatient.insuranceProvider} onChange={e => setNewPatient(p => ({ ...p, insuranceProvider: e.target.value }))} placeholder="Blue Cross" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Member ID</Label><Input value={newPatient.insuranceMemberId} onChange={e => setNewPatient(p => ({ ...p, insuranceMemberId: e.target.value }))} /></div>
                  <div><Label>Group #</Label><Input value={newPatient.insuranceGroup} onChange={e => setNewPatient(p => ({ ...p, insuranceGroup: e.target.value }))} /></div>
                </div>
              </div>
            </div>

            {createError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{createError}</div>
            )}

            <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11" disabled={!newPatient.firstName || !newPatient.lastName || isCreating}
              onClick={async () => {
                console.log('Create patient clicked:', newPatient.firstName, newPatient.lastName);
                setCreateError('');
                setIsCreating(true);
                try {
                  if (newPatient.email) {
                    const { data: existing } = await supabase.from('tenant_patients').select('id').ilike('email', newPatient.email.trim()).maybeSingle();
                    if (existing) { setCreateError('A patient with this email already exists'); setIsCreating(false); return; }
                  }

                  console.log('Inserting patient...');
                  const { data, error } = await supabase.from('tenant_patients').insert({
                    first_name: newPatient.firstName.trim(),
                    last_name: newPatient.lastName.trim(),
                    email: newPatient.email?.trim() || null,
                    phone: newPatient.phone?.trim() || null,
                    date_of_birth: newPatient.dob || null,
                    address: newPatient.address?.trim() || null,
                    city: newPatient.city?.trim() || null,
                    state: newPatient.state?.trim() || null,
                    zipcode: newPatient.zipcode?.trim() || null,
                    insurance_provider: newPatient.insuranceProvider?.trim() || null,
                    insurance_member_id: newPatient.insuranceMemberId?.trim() || null,
                    insurance_group_number: newPatient.insuranceGroup?.trim() || null,
                    tenant_id: '00000000-0000-0000-0000-000000000001',
                  }).select().single();

                  console.log('Insert result:', { data, error });
                  if (error) throw error;
                  if (!data) throw new Error('Patient was not created');

                  toast.success(`${newPatient.firstName} ${newPatient.lastName} added!`);
                  setNewPatient({ firstName: '', lastName: '', email: '', phone: '', dob: '', address: '', city: '', state: 'FL', zipcode: '', insuranceProvider: '', insuranceMemberId: '', insuranceGroup: '' });
                  setCreatePatientOpen(false);

                  const { data: refreshed } = await supabase.from('tenant_patients').select('*').is('deleted_at', null).order('first_name').limit(500);
                  setAllPatients(refreshed || []);
                  setPatients(refreshed || []);

                  if (data) loadPatientData(data);
                } catch (err: any) {
                  console.error('Create patient error:', err);
                  const msg = err.message || 'Failed to create patient';
                  setCreateError(msg);
                  toast.error(msg, { duration: 6000 });
                } finally {
                  setIsCreating(false);
                }
              }}>
              {isCreating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : 'Create Patient'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PatientProfileTab;
