/**
 * ExpensesManager — company_expenses, the cost side of Frank's P&L.
 *
 * Rendered via Dashboard.tsx SECTION_SCREENS["billing/expenses"]; the nav
 * entry is ownerOnly, so in practice this is a super_admin screen. Adding /
 * editing / deleting still gates on `super_admin` inside this file so an
 * office_manager who lands here by URL sees it read-only.
 *
 * Every row maps to exactly ONE bucket so the tiles, chips and list agree:
 *
 *   recurring  active, frequency != one_time   → counts toward monthly burn
 *   one_time   active, frequency == one_time   → logged, not in burn
 *   ended      active recurring with an end_date in the past (still in burn
 *              today — flagged so the owner can pause it)
 *   paused     is_active = false
 *
 * Monthly burn / payroll / debt / runway use the same MONTHLY_FACTOR the
 * expense_monthly_dollars RPC uses, so the numbers here match Frank's.
 * "Ended" rows are still included in burn (unchanged behaviour); the bucket
 * only surfaces them in Needs action.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, isValid } from 'date-fns';
import {
  Receipt, Plus, Pencil, Trash2, Loader2, Wallet, Flame, TrendingDown, Save, X, CircleDollarSign,
  RefreshCw, Download, Pause, Play, ChevronRight, AlertTriangle,
} from 'lucide-react';
import {
  SectionHeader, StatTiles, FilterChips, SearchBox, LaneHeader, LoadingRows, EmptyState, ErrorBanner,
  Pill, fmtMoney, TH, TH_STICKY, TD_STICKY, rowKeyHandler, downloadCsv,
  type TileDef, type ChipDef,
} from './billing/BillingPrimitives';

// company_expenses isn't in the generated Database type.
const db = supabase as any;

// ── Domain constants (unchanged) ──────────────────────────────────────────
const CATEGORIES = [
  { value: 'payroll', label: 'Payroll / Salary' },
  { value: 'contractor', label: 'Contractor / 1099' },
  { value: 'debt', label: 'Debt / Loan payment' },
  { value: 'rent', label: 'Rent / Lease' },
  { value: 'software', label: 'Software / SaaS' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'supplies', label: 'Supplies (non per-visit)' },
  { value: 'marketing', label: 'Marketing / Ads' },
  { value: 'professional_services', label: 'Professional services (legal, CPA)' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'utilities', label: 'Utilities / Phone' },
  { value: 'taxes', label: 'Taxes' },
  { value: 'owner_draw', label: "Owner's draw" },
  { value: 'bank_fees', label: 'Bank / processing fees' },
  { value: 'vehicle', label: 'Vehicle / Fuel' },
  { value: 'other', label: 'Other' },
];

const FREQUENCIES = [
  { value: 'one_time', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semiannual', label: 'Semi-annual' },
  { value: 'annual', label: 'Annual' },
];

const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));
const FREQ_LABEL: Record<string, string> = Object.fromEntries(FREQUENCIES.map((f) => [f.value, f.label]));

const CASH_SETTING_KEY = 'cfo_cash_on_hand_cents';

// Monthly-equivalent dollars per frequency (mirrors expense_monthly_dollars RPC)
const MONTHLY_FACTOR: Record<string, number> = {
  one_time: 0,
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
};

export interface Expense {
  id: string;
  category: string;
  label: string;
  amount_cents: number;
  frequency: string;
  expense_date: string;
  end_date: string | null;
  vendor: string | null;
  notes: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface FormState {
  category: string;
  label: string;
  amount: string; // dollars, as typed
  frequency: string;
  expense_date: string;
  end_date: string;
  vendor: string;
  notes: string;
  is_active: boolean;
}

const todayET = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const emptyForm = (): FormState => ({
  category: 'software', label: '', amount: '', frequency: 'monthly',
  expense_date: todayET(), end_date: '', vendor: '', notes: '', is_active: true,
});

export const monthlyOf = (e: Pick<Expense, 'amount_cents' | 'frequency'>) =>
  (e.amount_cents / 100) * (MONTHLY_FACTOR[e.frequency] ?? 0);

// ── Buckets ───────────────────────────────────────────────────────────────
export type Bucket = 'recurring' | 'one_time' | 'ended' | 'paused';

export function deriveBucket(e: Expense, today = todayET()): Bucket {
  if (!e.is_active) return 'paused';
  if (e.frequency === 'one_time') return 'one_time';
  if (e.end_date && e.end_date < today) return 'ended';
  return 'recurring';
}

interface BucketMeta { label: string; desc: string; pill: string; tile: string; dot: string }
const BUCKET_META: Record<Bucket, BucketMeta> = {
  recurring: {
    label: 'Recurring', desc: 'Active and counting toward monthly burn',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', tile: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500',
  },
  one_time: {
    label: 'One-time', desc: 'Logged once — not part of monthly burn',
    pill: 'bg-blue-100 text-blue-800 border-blue-200', tile: 'border-blue-300 bg-blue-50 text-blue-800', dot: 'bg-blue-500',
  },
  ended: {
    label: 'Ended', desc: 'End date has passed but the expense is still active, so it still counts in burn — pause it',
    pill: 'bg-red-100 text-red-800 border-red-200', tile: 'border-red-300 bg-red-50 text-red-800', dot: 'bg-red-500',
  },
  paused: {
    label: 'Paused', desc: 'Inactive — kept for history, excluded from burn',
    pill: 'bg-white text-gray-500 border-gray-300', tile: 'border-gray-300 bg-gray-50 text-gray-700', dot: 'bg-gray-300',
  },
};

type FilterKey = 'all' | 'needs_action' | Bucket;
const FILTERS: Array<{ key: FilterKey; label: string; desc: string; match: (b: Bucket) => boolean }> = [
  { key: 'all', label: 'All', desc: 'Every expense on file', match: () => true },
  { key: 'needs_action', label: 'Needs action', desc: 'Ended but still counting toward burn', match: b => b === 'ended' },
  { key: 'recurring', label: 'Recurring', desc: BUCKET_META.recurring.desc, match: b => b === 'recurring' },
  { key: 'one_time', label: 'One-time', desc: BUCKET_META.one_time.desc, match: b => b === 'one_time' },
  { key: 'ended', label: 'Ended', desc: BUCKET_META.ended.desc, match: b => b === 'ended' },
  { key: 'paused', label: 'Paused', desc: BUCKET_META.paused.desc, match: b => b === 'paused' },
];
const TILE_KEYS: Bucket[] = ['recurring', 'one_time', 'ended', 'paused'];

const fmtDay = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return isValid(d) ? format(d, 'MMM d, yyyy') : s;
};

interface RowHandlers {
  canEdit: boolean;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  onToggle: (e: Expense) => void;
}

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────
const ExpensesManager: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin';

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const [cashInput, setCashInput] = useState('');
  const [cashOnHand, setCashOnHand] = useState<number | null>(null);
  const [cashSaving, setCashSaving] = useState(false);

  // ── Data load ────────────────────────────────────────────────────────────
  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    const { data, error } = await db
      .from('company_expenses')
      .select('*')
      .order('is_active', { ascending: false })
      .order('amount_cents', { ascending: false });
    if (error) {
      setLastError(error.message);
      toast.error('Could not load expenses', { description: error.message });
    } else {
      setExpenses((data as Expense[]) || []);
    }
    setLoading(false);
  }, []);

  const loadCash = useCallback(async () => {
    const { data, error } = await db.from('system_settings').select('value').eq('key', CASH_SETTING_KEY).maybeSingle();
    if (!error && data?.value != null) {
      const cents = Number(data.value);
      if (!Number.isNaN(cents)) {
        setCashOnHand(cents / 100);
        setCashInput((cents / 100).toString());
      }
    }
  }, []);

  useEffect(() => { loadExpenses(); loadCash(); }, [loadExpenses, loadCash]);

  // ── Derived summary (same formulas as before) ────────────────────────────
  const bucketOf = useMemo(() => {
    const m = new Map<string, Bucket>();
    const today = todayET();
    for (const e of expenses) m.set(e.id, deriveBucket(e, today));
    return m;
  }, [expenses]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map(f => [f.key, 0])) as Record<FilterKey, number>;
    for (const e of expenses) { const b = bucketOf.get(e.id)!; for (const f of FILTERS) if (f.match(b)) c[f.key]++; }
    return c;
  }, [expenses, bucketOf]);

  const activeRecurring = useMemo(() => expenses.filter(e => e.is_active && e.frequency !== 'one_time'), [expenses]);
  const monthlyBurn = activeRecurring.reduce((s, e) => s + monthlyOf(e), 0);
  const payrollMonthly = activeRecurring.filter(e => e.category === 'payroll' || e.category === 'contractor').reduce((s, e) => s + monthlyOf(e), 0);
  const debtMonthly = activeRecurring.filter(e => e.category === 'debt').reduce((s, e) => s + monthlyOf(e), 0);
  const oneTimeTotal = expenses.filter(e => e.is_active && e.frequency === 'one_time').reduce((s, e) => s + e.amount_cents / 100, 0);
  const endedMonthly = expenses.filter(e => bucketOf.get(e.id) === 'ended').reduce((s, e) => s + monthlyOf(e), 0);
  const runwayMonths = cashOnHand != null && monthlyBurn > 0 ? cashOnHand / monthlyBurn : null;

  const byCategory = useMemo(() => Object.entries(
    activeRecurring.reduce((acc: Record<string, number>, e) => { acc[e.category] = (acc[e.category] || 0) + monthlyOf(e); return acc; }, {}),
  ).sort((a, b) => b[1] - a[1]), [activeRecurring]);

  const filtered = useMemo(() => {
    const def = FILTERS.find(f => f.key === filter)!;
    const q = search.trim().toLowerCase();
    return expenses.filter(e => def.match(bucketOf.get(e.id)!) && (q === '' ||
      e.label.toLowerCase().includes(q) ||
      (e.vendor || '').toLowerCase().includes(q) ||
      (CAT_LABEL[e.category] || e.category).toLowerCase().includes(q) ||
      (e.notes || '').toLowerCase().includes(q)
    ));
  }, [expenses, filter, search, bucketOf]);

  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = filtered.filter(e => bucketOf.get(e.id) === 'ended');
    if (action.length === 0) return null;
    return { action, rest: filtered.filter(e => bucketOf.get(e.id) !== 'ended') };
  }, [filtered, filter, bucketOf]);

  // ── Form handlers (unchanged behaviour) ──────────────────────────────────
  const openAdd = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };

  const openEdit = useCallback((e: Expense) => {
    setEditingId(e.id);
    setForm({
      category: e.category, label: e.label, amount: (e.amount_cents / 100).toString(), frequency: e.frequency,
      expense_date: e.expense_date, end_date: e.end_date || '', vendor: e.vendor || '', notes: e.notes || '', is_active: e.is_active,
    });
    setDialogOpen(true);
  }, []);

  const saveExpense = async () => {
    const amountNum = parseFloat(form.amount);
    if (!form.label.trim()) { toast.error('Give the expense a label (e.g. "Office rent").'); return; }
    if (Number.isNaN(amountNum) || amountNum < 0) { toast.error('Enter a valid dollar amount.'); return; }
    setSaving(true);
    const payload = {
      category: form.category,
      label: form.label.trim(),
      amount_cents: Math.round(amountNum * 100),
      frequency: form.frequency,
      expense_date: form.expense_date,
      end_date: form.end_date || null,
      vendor: form.vendor.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };
    let error;
    if (editingId) {
      ({ error } = await db.from('company_expenses').update(payload).eq('id', editingId));
    } else {
      const { data: userData } = await supabase.auth.getUser();
      ({ error } = await db.from('company_expenses').insert({ ...payload, created_by: userData?.user?.id ?? null }));
    }
    setSaving(false);
    if (error) { toast.error('Save failed', { description: error.message }); return; }
    toast.success(editingId ? 'Expense updated' : 'Expense added');
    setDialogOpen(false);
    loadExpenses();
  };

  const deleteExpense = useCallback(async (e: Expense) => {
    if (!window.confirm(`Delete "${e.label}"? This cannot be undone.`)) return;
    const { error } = await db.from('company_expenses').delete().eq('id', e.id);
    if (error) { toast.error('Delete failed', { description: error.message }); return; }
    toast.success('Expense deleted');
    loadExpenses();
  }, [loadExpenses]);

  const toggleActive = useCallback(async (e: Expense) => {
    const { error } = await db.from('company_expenses').update({ is_active: !e.is_active }).eq('id', e.id);
    if (error) { toast.error('Update failed', { description: error.message }); return; }
    toast.success(e.is_active ? `"${e.label}" paused — removed from burn` : `"${e.label}" active again`);
    loadExpenses();
  }, [loadExpenses]);

  const saveCash = async () => {
    const num = parseFloat(cashInput);
    if (Number.isNaN(num) || num < 0) { toast.error('Enter a valid cash-on-hand amount.'); return; }
    setCashSaving(true);
    const cents = Math.round(num * 100);
    // Store as a jsonb NUMBER (not a quoted string) so the frank_cfo_expenses
    // RPC's (value::text)::numeric cast succeeds.
    const { error } = await db.from('system_settings').upsert({ key: CASH_SETTING_KEY, value: cents }, { onConflict: 'key' });
    setCashSaving(false);
    if (error) { toast.error('Could not save cash on hand', { description: error.message }); return; }
    setCashOnHand(num);
    toast.success('Cash on hand updated — Frank can now compute runway.');
  };

  const exportCSV = () => {
    const rows = filtered.map(e => [
      BUCKET_META[bucketOf.get(e.id)!].label, e.label, e.vendor || '', CAT_LABEL[e.category] || e.category,
      (e.amount_cents / 100).toFixed(2), FREQ_LABEL[e.frequency] || e.frequency, e.frequency === 'one_time' ? '' : monthlyOf(e).toFixed(2),
      e.expense_date, e.end_date || '', e.is_active ? 'yes' : 'no', e.notes || '',
    ]);
    downloadCsv(`convelabs-expenses-${todayET()}.csv`,
      ['Bucket', 'Expense', 'Vendor', 'Category', 'Amount', 'Frequency', 'Monthly equivalent', 'Start / date', 'End date', 'Active', 'Notes'], rows);
    toast.success(`${rows.length} expense${rows.length === 1 ? '' : 's'} exported`);
  };

  const handlers: RowHandlers = { canEdit, onEdit: openEdit, onDelete: deleteExpense, onToggle: toggleActive };

  const tiles: Array<TileDef<Bucket>> = [
    { key: 'recurring', label: 'Recurring', desc: BUCKET_META.recurring.desc, tile: BUCKET_META.recurring.tile, sub: `${fmtMoney(monthlyBurn - endedMonthly)} / mo` },
    { key: 'one_time', label: 'One-time', desc: BUCKET_META.one_time.desc, tile: BUCKET_META.one_time.tile, sub: fmtMoney(oneTimeTotal) },
    { key: 'ended', label: 'Ended', desc: BUCKET_META.ended.desc, tile: BUCKET_META.ended.tile, sub: `${fmtMoney(endedMonthly)} / mo`, alert: true },
    { key: 'paused', label: 'Paused', desc: BUCKET_META.paused.desc, tile: BUCKET_META.paused.tile, sub: 'excluded' },
  ];
  const chips: Array<ChipDef<FilterKey>> = FILTERS.map(f => ({
    key: f.key, label: f.label, desc: f.desc,
    dot: f.key === 'all' || f.key === 'needs_action' ? undefined : BUCKET_META[f.key as Bucket].dot,
  }));
  const activeFilter = FILTERS.find(f => f.key === filter)!;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4">
      <SectionHeader
        icon={Receipt}
        title="Expenses"
        subtitle={<>
          Every recurring and one-time cost. Frank uses this for true net profit, burn and runway.
          {!loading && counts.ended > 0 && <span className="ml-1 font-medium text-red-700">{counts.ended} ended but still in burn.</span>}
        </>}
        actions={<>
          <Button variant="outline" size="sm" onClick={() => { loadExpenses(); loadCash(); }} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 text-xs h-10 sm:h-9" disabled={filtered.length === 0} aria-label="Export CSV">
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={openAdd} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 text-xs h-10 sm:h-9">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Add expense</span>
              <span className="sm:hidden">Add</span>
            </Button>
          )}
        </>}
      />

      {/* Money KPIs — same formulas as before (mirror the Frank RPC). */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <MoneyTile icon={Flame} iconClass="text-orange-500" label="Monthly burn" value={fmtMoney(monthlyBurn)} sub={`${activeRecurring.length} active recurring`} loading={loading} />
        <MoneyTile icon={CircleDollarSign} iconClass="text-blue-500" label="Payroll / month" value={fmtMoney(payrollMonthly)} sub="payroll + contractor" loading={loading} />
        <MoneyTile icon={TrendingDown} iconClass="text-rose-500" label="Debt / month" value={fmtMoney(debtMonthly)} sub="loan & debt service" loading={loading} />
        <MoneyTile icon={Wallet} iconClass="text-emerald-500" label="Runway" value={runwayMonths != null ? `${runwayMonths.toFixed(1)} mo` : '—'} sub={cashOnHand == null ? 'set cash on hand below' : `${fmtMoney(cashOnHand)} ÷ burn`} loading={loading} />
      </div>

      {/* Stat tiles — the four buckets partition every row. */}
      <StatTiles tiles={tiles} counts={counts} active={filter} loading={loading} onSelect={k => setFilter(filter === k ? 'all' : k)} ariaLabel="Expense counts" cols={4} />

      {lastError && <ErrorBanner title="Couldn't load expenses" message={lastError} onRetry={loadExpenses} />}

      {/* Cash on hand + category rollup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <Label htmlFor="cash" className="text-sm font-medium text-gray-700">Cash on hand (bank balance)</Label>
            <div className="flex items-start gap-2 mt-1">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <Input id="cash" type="number" min="0" step="0.01" className="pl-7 h-10 sm:h-9" value={cashInput} onChange={(e) => setCashInput(e.target.value)} placeholder="e.g. 25000" disabled={!canEdit} />
              </div>
              {canEdit && (
                <Button variant="outline" onClick={saveCash} disabled={cashSaving} className="h-10 sm:h-9 text-xs gap-1.5">
                  {cashSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />} Save
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">Frank needs this to calculate runway — months of survival if revenue stopped.</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Monthly burn by category</h3>
            {byCategory.length === 0 ? (
              <p className="text-xs text-gray-400">No active recurring expenses yet.</p>
            ) : (
              <div className="space-y-1.5">
                {byCategory.map(([cat, amt]) => {
                  const pct = monthlyBurn > 0 ? (amt / monthlyBurn) * 100 : 0;
                  return (
                    <div key={cat} className="flex items-center gap-2 text-xs">
                      <div className="w-32 sm:w-40 text-gray-600 truncate">{CAT_LABEL[cat] || cat}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-[#B91C1C] h-full rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-20 text-right font-medium text-gray-900 tabular-nums">{fmtMoney(amt)}</div>
                      <div className="w-9 text-right text-gray-400 tabular-nums">{pct.toFixed(0)}%</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search expense, vendor, category, notes…" ariaLabel="Search expenses" />
        <FilterChips chips={chips} counts={counts} active={filter} onSelect={setFilter} ariaLabel="Expense filter" />
      </div>

      {loading && expenses.length === 0 ? (
        <LoadingRows label="Loading expenses" rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          total={expenses.length}
          hasSearch={search.trim() !== ''}
          filterLabel={activeFilter.label}
          filterDesc={activeFilter.desc}
          nothingTitle="No expenses logged yet."
          nothingHint="Add payroll, rent, software, debt and other costs so Frank can show true net profit."
          searchHint="Try an expense label, vendor or category."
          noun="expenses"
          onReset={() => { setFilter('all'); setSearch(''); }}
          action={canEdit ? <Button size="sm" onClick={openAdd} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 text-xs h-9"><Plus className="h-4 w-4" /> Add expense</Button> : undefined}
        />
      ) : lanes ? (
        <div className="space-y-5">
          <section aria-labelledby="exp-lane-action">
            <LaneHeader id="exp-lane-action" title="Needs action" count={lanes.action.length} tone="red" hint="ended but still counting toward burn" />
            <ExpenseRows rows={lanes.action} bucketOf={bucketOf} h={handlers} />
          </section>
          {lanes.rest.length > 0 && (
            <section aria-labelledby="exp-lane-rest">
              <LaneHeader id="exp-lane-rest" title="Everything else" count={lanes.rest.length} tone="gray" />
              <ExpenseRows rows={lanes.rest} bucketOf={bucketOf} h={handlers} />
            </section>
          )}
        </div>
      ) : (
        <ExpenseRows rows={filtered} bucketOf={bucketOf} h={handlers} />
      )}

      <p className="text-[11px] text-gray-400">Showing {filtered.length} of {expenses.length} expense{expenses.length === 1 ? '' : 's'}</p>

      {/* Add/Edit dialog (unchanged fields) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-[#B91C1C]" aria-hidden="true" /> {editingId ? 'Edit expense' : 'Add expense'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-sm">Label</Label>
              <Input className="mt-1" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder='e.g. "Office rent", "Assistant salary", "SBA loan"' />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Amount</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <Input type="number" min="0" step="0.01" className="pl-7" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                </div>
                {form.frequency !== 'one_time' && form.amount && !Number.isNaN(parseFloat(form.amount)) && (
                  <p className="text-[11px] text-gray-400 mt-1">≈ {fmtMoney(parseFloat(form.amount) * (MONTHLY_FACTOR[form.frequency] ?? 0))} / month</p>
                )}
              </div>
              <div>
                <Label className="text-sm">{form.frequency === 'one_time' ? 'Date' : 'Start date'}</Label>
                <Input type="date" className="mt-1" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Vendor (optional)</Label>
                <Input className="mt-1" value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} placeholder="e.g. WeWork, Gusto" />
              </div>
              {form.frequency !== 'one_time' && (
                <div>
                  <Label className="text-sm">End date (optional)</Label>
                  <Input type="date" className="mt-1" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
                </div>
              )}
            </div>
            <div>
              <Label className="text-sm">Notes (optional)</Label>
              <Textarea className="mt-1" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              <Label className="text-sm text-gray-600">Active (counts toward monthly burn)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}><X className="h-4 w-4 mr-1.5" aria-hidden="true" /> Cancel</Button>
            <Button onClick={saveExpense} disabled={saving} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" /> : <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />}
              {editingId ? 'Save changes' : 'Add expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
// Presentational pieces
// ──────────────────────────────────────────────────────────────────
const MoneyTile: React.FC<{ icon: React.ElementType; iconClass: string; label: string; value: string; sub: string; loading: boolean }> = ({ icon: Icon, iconClass, label, value, sub, loading }) => (
  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 min-h-[64px] shadow-sm">
    <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-1 truncate">
      <Icon className={cn('h-3.5 w-3.5', iconClass)} aria-hidden="true" /> {label}
    </p>
    <p className="text-2xl font-bold leading-tight mt-0.5 text-gray-900 tabular-nums">{loading ? '–' : value}</p>
    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>
  </div>
);

const StatusPill: React.FC<{ bucket: Bucket; className?: string }> = ({ bucket, className }) => (
  <Pill className={cn(BUCKET_META[bucket].pill, className)} dot={BUCKET_META[bucket].dot} title={BUCKET_META[bucket].desc}>{BUCKET_META[bucket].label}</Pill>
);

const RowActions: React.FC<{ e: Expense; bucket: Bucket; h: RowHandlers; mobile?: boolean }> = ({ e, bucket, h, mobile }) => {
  if (!h.canEdit) return <span className="text-[11px] text-gray-400">Read-only</span>;
  const stop = (ev: React.SyntheticEvent) => ev.stopPropagation();
  const size = mobile ? 'h-11' : 'h-9';
  return (
    <div className={cn('flex items-center gap-1', mobile ? 'w-full' : 'justify-end')}>
      {bucket === 'ended' ? (
        <Button size="sm" className={cn('bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5', size, mobile && 'flex-1 justify-center')} onClick={(ev) => { stop(ev); h.onToggle(e); }}>
          <Pause className="h-3.5 w-3.5" aria-hidden="true" /> Pause
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" className={cn('text-xs gap-1.5', size, mobile && 'flex-1 justify-center')} onClick={(ev) => { stop(ev); h.onToggle(e); }} aria-label={e.is_active ? 'Pause expense' : 'Resume expense'}>
              {e.is_active ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
              {e.is_active ? 'Pause' : 'Resume'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{e.is_active ? 'Stop counting this toward monthly burn' : 'Count this toward monthly burn again'}</TooltipContent>
        </Tooltip>
      )}
      <Button size="sm" variant="ghost" className={cn('w-9 p-0', size, mobile && 'w-11 border border-gray-200')} onClick={(ev) => { stop(ev); h.onEdit(e); }} aria-label={`Edit ${e.label}`}>
        <Pencil className="h-4 w-4 text-gray-500" aria-hidden="true" />
      </Button>
      <Button size="sm" variant="ghost" className={cn('w-9 p-0', size, mobile && 'w-11 border border-gray-200')} onClick={(ev) => { stop(ev); h.onDelete(e); }} aria-label={`Delete ${e.label}`}>
        <Trash2 className="h-4 w-4 text-rose-500" aria-hidden="true" />
      </Button>
    </div>
  );
};

const ExpenseRows: React.FC<{ rows: Expense[]; bucketOf: Map<string, Bucket>; h: RowHandlers }> = ({ rows, bucketOf, h }) => {
  const bucket = (e: Expense) => bucketOf.get(e.id) || deriveBucket(e);
  const open = (e: Expense) => () => { if (h.canEdit) h.onEdit(e); };
  return (
    <>
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className={cn(TH, 'pl-4')}>Expense</TableHead>
              <TableHead className={TH}>Category</TableHead>
              <TableHead className={cn(TH, 'text-right')}>Amount</TableHead>
              <TableHead className={TH}>Frequency</TableHead>
              <TableHead className={cn(TH, 'text-right whitespace-nowrap')}>≈ / month</TableHead>
              <TableHead className={TH}>Status</TableHead>
              <TableHead className={cn(TH, 'hidden xl:table-cell whitespace-nowrap')}>Dates</TableHead>
              <TableHead className={TH_STICKY}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(e => {
              const b = bucket(e);
              return (
                <TableRow
                  key={e.id}
                  role={h.canEdit ? 'button' : undefined}
                  tabIndex={h.canEdit ? 0 : undefined}
                  onClick={open(e)}
                  onKeyDown={rowKeyHandler(open(e))}
                  aria-label={`${e.label}, ${BUCKET_META[b].label}`}
                  className={cn('bg-white focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40',
                    h.canEdit && 'cursor-pointer', b === 'paused' && 'opacity-60', b === 'ended' && 'border-l-4 border-l-red-500')}
                >
                  <TableCell className="py-2.5 pl-4 align-top">
                    <div className="text-sm font-semibold text-gray-800">{e.label}</div>
                    {e.vendor && <div className="text-[11px] text-gray-500">{e.vendor}</div>}
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700">{CAT_LABEL[e.category] || e.category}</TableCell>
                  <TableCell className="py-2.5 align-top text-sm font-semibold text-right tabular-nums whitespace-nowrap">{fmtMoney(e.amount_cents, { cents: true })}</TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700">{FREQ_LABEL[e.frequency] || e.frequency}</TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-right tabular-nums text-gray-700 whitespace-nowrap">{e.frequency === 'one_time' ? '—' : fmtMoney(monthlyOf(e))}</TableCell>
                  <TableCell className="py-2.5 align-top"><StatusPill bucket={b} /></TableCell>
                  <TableCell className="hidden xl:table-cell py-2.5 align-top text-xs text-gray-600 whitespace-nowrap">
                    {fmtDay(e.expense_date)}{e.end_date && <span className={cn(b === 'ended' ? 'text-red-700' : 'text-gray-400')}> → {fmtDay(e.end_date)}</span>}
                  </TableCell>
                  <TableCell className={TD_STICKY}><RowActions e={e} bucket={b} h={h} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-2">
        {rows.map(e => {
          const b = bucket(e);
          return (
            <Card
              key={e.id}
              role={h.canEdit ? 'button' : undefined}
              tabIndex={h.canEdit ? 0 : undefined}
              onClick={open(e)}
              onKeyDown={rowKeyHandler(open(e))}
              aria-label={`${e.label}, ${BUCKET_META[b].label}`}
              className={cn('shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40', h.canEdit && 'cursor-pointer', b === 'paused' && 'opacity-60', b === 'ended' && 'border-l-4 border-l-red-500')}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-800">{e.label}</div>
                    <div className="text-[11px] text-gray-500 truncate">{[e.vendor, CAT_LABEL[e.category] || e.category].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold tabular-nums whitespace-nowrap">{fmtMoney(e.amount_cents, { cents: true })}</div>
                    <div className="text-[11px] text-gray-500">{FREQ_LABEL[e.frequency] || e.frequency}{e.frequency !== 'one_time' && ` · ≈ ${fmtMoney(monthlyOf(e))}/mo`}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <StatusPill bucket={b} />
                  <span>{fmtDay(e.expense_date)}{e.end_date && ` → ${fmtDay(e.end_date)}`}</span>
                </div>
                {b === 'ended' && (
                  <p className="text-[11px] text-red-700 flex items-center gap-1"><AlertTriangle className="h-3 w-3" aria-hidden="true" /> Still counting toward burn after its end date.</p>
                )}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <RowActions e={e} bucket={b} h={h} mobile />
                  {h.canEdit && <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" aria-hidden="true" />}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
};

export default ExpensesManager;
