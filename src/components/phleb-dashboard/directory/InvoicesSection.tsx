import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Search, Receipt } from 'lucide-react';

interface Row {
  id: string;
  patient_name: string;
  appointment_date: string;
  service_name: string | null;
  total_amount: number | null;
  invoice_status: string | null;
  payment_status: string | null;
  stripe_invoice_url: string | null;
  org_name?: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  sent: 'bg-blue-100 text-blue-800 border-blue-200',
  pending_send: 'bg-amber-100 text-amber-800 border-amber-200',
  not_required: 'bg-gray-100 text-gray-600 border-gray-200',
  missing_email: 'bg-red-100 text-red-800 border-red-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

const InvoicesSection: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        // Appointments assigned to this phleb that have a non-zero invoice
        const { data, error } = await supabase
          .from('appointments')
          .select('id, patient_name, appointment_date, service_name, total_amount, invoice_status, payment_status, stripe_invoice_url, organization_id, organizations(name)')
          .eq('phlebotomist_id', user.id)
          .gt('total_amount', 0)
          .order('appointment_date', { ascending: false })
          .limit(200);
        if (error) throw error;
        setRows(((data || []) as any[]).map((a) => ({
          id: a.id,
          patient_name: a.patient_name,
          appointment_date: a.appointment_date,
          service_name: a.service_name,
          total_amount: a.total_amount,
          invoice_status: a.invoice_status,
          payment_status: a.payment_status,
          stripe_invoice_url: a.stripe_invoice_url,
          org_name: a.organizations?.name || null,
        })));
      } finally { setLoading(false); }
    })();
  }, [user?.id]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === 'paid' && r.payment_status !== 'completed') return false;
      if (filter === 'unpaid' && r.payment_status === 'completed') return false;
      if (!query) return true;
      return (
        (r.patient_name || '').toLowerCase().includes(query) ||
        (r.service_name || '').toLowerCase().includes(query) ||
        (r.org_name || '').toLowerCase().includes(query)
      );
    });
  }, [rows, q, filter]);

  const totals = useMemo(() => {
    const all = rows.reduce((s, r) => s + (r.total_amount || 0), 0);
    const paid = rows.filter(r => r.payment_status === 'completed').reduce((s, r) => s + (r.total_amount || 0), 0);
    return { all, paid, outstanding: all - paid };
  }, [rows]);

  return (
    <div className="space-y-3">
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Invoiced</p>
          <p className="text-base font-bold text-gray-900 mt-0.5">${totals.all.toFixed(0)}</p>
        </div>
        <div className="bg-white border rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Paid</p>
          <p className="text-base font-bold text-emerald-700 mt-0.5">${totals.paid.toFixed(0)}</p>
        </div>
        <div className="bg-white border rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Outstanding</p>
          <p className="text-base font-bold text-red-600 mt-0.5">${totals.outstanding.toFixed(0)}</p>
        </div>
      </div>

      {/* Search + filter chips */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patient, service, org…" className="pl-9 h-10" />
      </div>
      <div className="flex gap-2 flex-wrap">
        {(['all', 'paid', 'unpaid'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filter === f ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'
            }`}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="bg-white border rounded-lg p-4 animate-pulse h-16" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-10 text-center">
          <Receipt className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No invoices match your filters.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {filtered.map((r) => (
            <div key={r.id} className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{r.patient_name}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {r.service_name || 'Visit'}
                    {r.org_name && <> · {r.org_name}</>}
                    <> · {format(new Date(r.appointment_date), 'MMM d, yyyy')}</>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-sm text-gray-900">${Number(r.total_amount).toFixed(0)}</p>
                  <div className="flex flex-col items-end gap-1 mt-1">
                    {r.invoice_status && (
                      <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[r.invoice_status] || 'bg-gray-100'}`}>
                        {String(r.invoice_status).replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {r.payment_status === 'completed' && (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">Paid</Badge>
                    )}
                  </div>
                </div>
              </div>
              {r.stripe_invoice_url && (
                <a
                  href={r.stripe_invoice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[11px] text-[#B91C1C] hover:underline"
                >
                  View Stripe invoice →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InvoicesSection;
