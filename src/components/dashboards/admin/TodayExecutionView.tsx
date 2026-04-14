import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import {
  Clock, DollarSign, AlertTriangle, MapPin, Phone, Mail,
  CheckCircle2, Truck, Activity, XCircle, TrendingUp, Calendar,
  ChevronRight, User,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';

/**
 * TODAY EXECUTION VIEW
 * Hormozi-style single-screen answer to: "What needs to happen today to protect today's revenue?"
 * - Revenue collected vs booked
 * - Each visit with status + one-click action
 * - Unbooked slot gaps (opportunity)
 * - Top alerts (no lab order, unpaid, late phleb)
 */

type Appt = {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  status: string;
  payment_status: string | null;
  patient_name: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  address: string | null;
  service_type: string | null;
  service_name: string | null;
  total_amount: number | null;
  lab_order_file_path: string | null;
  phleb_id: string | null;
  notes: string | null;
};

const STATUS_ORDER = ['in_progress', 'en_route', 'confirmed', 'scheduled', 'completed', 'cancelled'];

const statusStyle = (s: string) => {
  const map: Record<string, { bg: string; text: string; icon: any; label: string }> = {
    scheduled: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: Clock, label: 'Scheduled' },
    confirmed: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: CheckCircle2, label: 'Confirmed' },
    en_route: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: Truck, label: 'En Route' },
    in_progress: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', icon: Activity, label: 'In Progress' },
    completed: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', icon: CheckCircle2, label: 'Completed' },
    cancelled: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: XCircle, label: 'Cancelled' },
  };
  return map[s] || map.scheduled;
};

interface TodayExecutionViewProps {
  basePath: string; // e.g. `/dashboard/super_admin` or `/dashboard/office_manager`
}

const TodayExecutionView: React.FC<TodayExecutionViewProps> = ({ basePath }) => {
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const fetchToday = async () => {
    setLoading(true);
    // appointment_date is timestamptz — use a day-range filter
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .gte('appointment_date', todayStr)
      .lt('appointment_date', tomorrowStr)
      .order('appointment_time', { ascending: true });
    setAppts((data || []) as Appt[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchToday();
    // Auto-refresh every 60s for live status tracking
    const iv = setInterval(fetchToday, 60_000);
    return () => clearInterval(iv);
  }, []);

  const metrics = useMemo(() => {
    const active = appts.filter(a => a.status !== 'cancelled');
    const completed = active.filter(a => a.status === 'completed');
    const remaining = active.filter(a => ['scheduled', 'confirmed', 'en_route', 'in_progress'].includes(a.status));
    const collected = completed.reduce((s, a) => s + (a.total_amount || 0), 0);
    const booked = active.reduce((s, a) => s + (a.total_amount || 0), 0);
    const unpaid = active.filter(a => a.payment_status !== 'completed').length;
    const missingLabOrder = remaining.filter(a => !a.lab_order_file_path && (a.service_type === 'mobile' || a.service_type === 'senior')).length;
    const unassigned = remaining.filter(a => !a.phleb_id).length;
    return {
      total: active.length,
      completed: completed.length,
      remaining: remaining.length,
      collected,
      booked,
      unpaid,
      missingLabOrder,
      unassigned,
      progress: active.length ? (completed.length / active.length) * 100 : 0,
    };
  }, [appts]);

  const sorted = useMemo(() => {
    return [...appts].sort((a, b) => {
      const sa = STATUS_ORDER.indexOf(a.status);
      const sb = STATUS_ORDER.indexOf(b.status);
      if (sa !== sb) return sa - sb;
      return (a.appointment_time || '').localeCompare(b.appointment_time || '');
    });
  }, [appts]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success(`Marked ${status}`);
    fetchToday();
  };

  const dialPhone = (phone: string | null) => {
    if (!phone) return;
    window.location.href = `tel:${phone.replace(/\D/g, '')}`;
  };

  const textPhone = (phone: string | null, name: string | null) => {
    if (!phone) return;
    const clean = phone.replace(/\D/g, '');
    window.location.href = `sms:+1${clean}?&body=Hi ${name?.split(' ')[0] || ''}, this is ConveLabs — `;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-[#B91C1C]" /> Today's Execution — {format(new Date(), 'EEEE, MMM d')}
          </h2>
          <p className="text-xs text-muted-foreground">Live snapshot of today's revenue and visits · auto-refreshes every 60s</p>
        </div>
      </div>

      {/* Money + Progress strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm border-emerald-200 bg-emerald-50">
          <CardContent className="p-3">
            <p className="text-[10px] uppercase font-semibold text-emerald-700">Collected Today</p>
            <p className="text-2xl font-bold text-emerald-800">${metrics.collected.toFixed(0)}</p>
            <p className="text-[10px] text-emerald-600 mt-0.5">of ${metrics.booked.toFixed(0)} booked</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">Visits</p>
            <p className="text-2xl font-bold">{metrics.completed}<span className="text-muted-foreground text-base font-medium">/{metrics.total}</span></p>
            <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${metrics.progress}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card className={`shadow-sm ${metrics.remaining > 0 ? 'border-blue-200 bg-blue-50' : ''}`}>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">Remaining</p>
            <p className="text-2xl font-bold">{metrics.remaining}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">active visits</p>
          </CardContent>
        </Card>
        <Card className={`shadow-sm ${metrics.missingLabOrder + metrics.unpaid + metrics.unassigned > 0 ? 'border-red-200 bg-red-50' : ''}`}>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase font-semibold text-red-700">Needs Attention</p>
            <p className="text-2xl font-bold text-red-700">{metrics.missingLabOrder + metrics.unpaid + metrics.unassigned}</p>
            <p className="text-[10px] text-red-600 mt-0.5">issues blocking today</p>
          </CardContent>
        </Card>
      </div>

      {/* Attention Row */}
      {(metrics.missingLabOrder > 0 || metrics.unpaid > 0 || metrics.unassigned > 0) && (
        <div className="flex flex-wrap gap-2">
          {metrics.missingLabOrder > 0 && (
            <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-800 px-3 py-1.5 text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" /> {metrics.missingLabOrder} missing lab order{metrics.missingLabOrder !== 1 ? 's' : ''}
            </Badge>
          )}
          {metrics.unpaid > 0 && (
            <Badge variant="outline" className="bg-red-50 border-red-300 text-red-800 px-3 py-1.5 text-xs">
              <DollarSign className="h-3 w-3 mr-1" /> {metrics.unpaid} unpaid
            </Badge>
          )}
          {metrics.unassigned > 0 && (
            <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-800 px-3 py-1.5 text-xs">
              <User className="h-3 w-3 mr-1" /> {metrics.unassigned} unassigned to phleb
            </Badge>
          )}
        </div>
      )}

      {/* Visit list */}
      {loading ? (
        <Card className="shadow-sm"><CardContent className="p-8 text-center text-sm text-muted-foreground">Loading today's visits...</CardContent></Card>
      ) : sorted.length === 0 ? (
        <Card className="shadow-sm border-dashed">
          <CardContent className="p-8 text-center">
            <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <p className="font-semibold">No visits today</p>
            <p className="text-xs text-muted-foreground mb-3">Great day to run a campaign or fill tomorrow's calendar.</p>
            <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white" asChild>
              <Link to={`${basePath}/calendar`}>Open Calendar →</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((a) => {
            const sty = statusStyle(a.status);
            const Icon = sty.icon;
            const missingLab = !a.lab_order_file_path && (a.service_type === 'mobile' || a.service_type === 'senior') && a.status !== 'completed' && a.status !== 'cancelled';
            const unpaid = a.payment_status !== 'completed' && a.status !== 'cancelled';
            return (
              <Card key={a.id} className={`shadow-sm border ${sty.bg}`}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className={`h-9 w-9 rounded-lg ${sty.bg} border ${sty.text} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm truncate">{a.patient_name || 'Unknown patient'}</p>
                        <Badge variant="outline" className={`text-[10px] ${sty.text} ${sty.bg} border-current`}>
                          {sty.label}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground">{a.appointment_time || '—'}</span>
                        {a.total_amount && <span className="text-xs font-semibold text-emerald-700">${a.total_amount.toFixed(0)}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                        <MapPin className="h-3 w-3 flex-shrink-0" /> {a.address || 'No address'}
                      </p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {missingLab && <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-700 text-[10px]">No lab order</Badge>}
                        {unpaid && <Badge variant="outline" className="bg-red-50 border-red-300 text-red-700 text-[10px]">Unpaid</Badge>}
                        {!a.phleb_id && a.status !== 'completed' && a.status !== 'cancelled' && (
                          <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-700 text-[10px]">Unassigned</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {a.patient_phone && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => dialPhone(a.patient_phone)}>
                            <Phone className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => textPhone(a.patient_phone, a.patient_name)}>
                            <Mail className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {a.status === 'scheduled' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => updateStatus(a.id, 'confirmed')}>
                          Confirm
                        </Button>
                      )}
                      {a.status === 'confirmed' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => updateStatus(a.id, 'en_route')}>
                          En route
                        </Button>
                      )}
                      {['en_route', 'in_progress'].includes(a.status) && (
                        <Button size="sm" className="h-7 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateStatus(a.id, 'completed')}>
                          Complete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" asChild className="text-xs text-muted-foreground">
          <Link to={`${basePath}/appointments`}>View all appointments <ChevronRight className="h-3 w-3 ml-0.5" /></Link>
        </Button>
      </div>
    </div>
  );
};

export default TodayExecutionView;
