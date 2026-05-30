import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Receipt, Plus, Pencil, Trash2, Loader2, Wallet, Flame,
  TrendingDown, Save, X, CircleDollarSign,
} from 'lucide-react';

// ── Domain constants ──────────────────────────────────────────────────────
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

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
);
const FREQ_LABEL: Record<string, string> = Object.fromEntries(
  FREQUENCIES.map((f) => [f.value, f.label]),
);

const CASH_SETTING_KEY = 'cfo_cash_on_hand_cents';

interface Expense {
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
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

const emptyForm = (): FormState => ({
  category: 'software',
  label: '',
  amount: '',
  frequency: 'monthly',
  expense_date: todayET(),
  end_date: '',
  vendor: '',
  notes: '',
  is_active: true,
});

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

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

const ExpensesManager: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const [cashInput, setCashInput] = useState('');
  const [cashOnHand, setCashOnHand] = useState<number | null>(null);
  const [cashSaving, setCashSaving] = useState(false);

  // ── Data load ────────────────────────────────────────────────────────────
  const loadExpenses = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('company_expenses')
      .select('*')
      .order('is_active', { ascending: false })
      .order('amount_cents', { ascending: false });
    if (error) {
      toast.error('Could not load expenses', { description: error.message });
    } else {
      setExpenses((data as Expense[]) || []);
    }
    setLoading(false);
  }, []);

  const loadCash = useCallback(async () => {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', CASH_SETTING_KEY)
      .maybeSingle();
    if (!error && data?.value != null) {
      const cents = Number(data.value);
      if (!Number.isNaN(cents)) {
        setCashOnHand(cents / 100);
        setCashInput((cents / 100).toString());
      }
    }
  }, []);

  useEffect(() => {
    loadExpenses();
    loadCash();
  }, [loadExpenses, loadCash]);

  // ── Derived summary ───────────────────────────────────────────────────────
  const activeRecurring = expenses.filter(
    (e) => e.is_active && e.frequency !== 'one_time',
  );
  const monthlyBurn = activeRecurring.reduce(
    (s, e) => s + (e.amount_cents / 100) * (MONTHLY_FACTOR[e.frequency] ?? 0),
    0,
  );
  const payrollMonthly = activeRecurring
    .filter((e) => e.category === 'payroll' || e.category === 'contractor')
    .reduce((s, e) => s + (e.amount_cents / 100) * (MONTHLY_FACTOR[e.frequency] ?? 0), 0);
  const debtMonthly = activeRecurring
    .filter((e) => e.category === 'debt')
    .reduce((s, e) => s + (e.amount_cents / 100) * (MONTHLY_FACTOR[e.frequency] ?? 0), 0);

  // category rollup for the active recurring set
  const byCategory = Object.entries(
    activeRecurring.reduce((acc: Record<string, number>, e) => {
      const m = (e.amount_cents / 100) * (MONTHLY_FACTOR[e.frequency] ?? 0);
      acc[e.category] = (acc[e.category] || 0) + m;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  // ── Form handlers ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditingId(e.id);
    setForm({
      category: e.category,
      label: e.label,
      amount: (e.amount_cents / 100).toString(),
      frequency: e.frequency,
      expense_date: e.expense_date,
      end_date: e.end_date || '',
      vendor: e.vendor || '',
      notes: e.notes || '',
      is_active: e.is_active,
    });
    setDialogOpen(true);
  };

  const saveExpense = async () => {
    const amountNum = parseFloat(form.amount);
    if (!form.label.trim()) {
      toast.error('Give the expense a label (e.g. "Office rent").');
      return;
    }
    if (Number.isNaN(amountNum) || amountNum < 0) {
      toast.error('Enter a valid dollar amount.');
      return;
    }
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
      ({ error } = await supabase
        .from('company_expenses')
        .update(payload)
        .eq('id', editingId));
    } else {
      const { data: userData } = await supabase.auth.getUser();
      ({ error } = await supabase
        .from('company_expenses')
        .insert({ ...payload, created_by: userData?.user?.id ?? null }));
    }
    setSaving(false);
    if (error) {
      toast.error('Save failed', { description: error.message });
      return;
    }
    toast.success(editingId ? 'Expense updated' : 'Expense added');
    setDialogOpen(false);
    loadExpenses();
  };

  const deleteExpense = async (e: Expense) => {
    if (!window.confirm(`Delete "${e.label}"? This cannot be undone.`)) return;
    const { error } = await supabase
      .from('company_expenses')
      .delete()
      .eq('id', e.id);
    if (error) {
      toast.error('Delete failed', { description: error.message });
      return;
    }
    toast.success('Expense deleted');
    loadExpenses();
  };

  const toggleActive = async (e: Expense) => {
    const { error } = await supabase
      .from('company_expenses')
      .update({ is_active: !e.is_active })
      .eq('id', e.id);
    if (error) {
      toast.error('Update failed', { description: error.message });
      return;
    }
    loadExpenses();
  };

  const saveCash = async () => {
    const num = parseFloat(cashInput);
    if (Number.isNaN(num) || num < 0) {
      toast.error('Enter a valid cash-on-hand amount.');
      return;
    }
    setCashSaving(true);
    const cents = Math.round(num * 100);
    const { error } = await supabase
      .from('system_settings')
      .upsert(
        // Store as a jsonb NUMBER (not a quoted string) so the
        // frank_cfo_expenses RPC's (value::text)::numeric cast succeeds.
        { key: CASH_SETTING_KEY, value: cents },
        { onConflict: 'key' },
      );
    setCashSaving(false);
    if (error) {
      toast.error('Could not save cash on hand', { description: error.message });
      return;
    }
    setCashOnHand(num);
    toast.success('Cash on hand updated — Frank can now compute runway.');
  };

  const runwayMonths =
    cashOnHand != null && monthlyBurn > 0
      ? cashOnHand / monthlyBurn
      : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Receipt className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Company Expenses</h2>
            <p className="text-sm text-gray-500">
              Log every recurring & one-time cost. Frank uses this to report true net profit, burn & runway.
            </p>
          </div>
        </div>
        <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1.5" /> Add expense
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
            <Flame className="h-4 w-4 text-orange-500" /> Monthly burn
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{fmtMoney(monthlyBurn)}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {activeRecurring.length} active recurring
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
            <CircleDollarSign className="h-4 w-4 text-blue-500" /> Payroll / month
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{fmtMoney(payrollMonthly)}</div>
          <div className="text-xs text-gray-400 mt-0.5">payroll + contractor</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
            <TrendingDown className="h-4 w-4 text-rose-500" /> Debt / month
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{fmtMoney(debtMonthly)}</div>
          <div className="text-xs text-gray-400 mt-0.5">loan & debt service</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
            <Wallet className="h-4 w-4 text-emerald-500" /> Runway
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900">
            {runwayMonths != null ? `${runwayMonths.toFixed(1)} mo` : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {cashOnHand == null ? 'set cash on hand' : 'cash ÷ burn'}
          </div>
        </Card>
      </div>

      {/* Cash on hand */}
      <Card className="p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="cash" className="text-sm font-medium text-gray-700">
              Cash on hand (bank balance)
            </Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <Input
                id="cash"
                type="number"
                min="0"
                step="0.01"
                className="pl-7"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                placeholder="e.g. 25000"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Frank needs this to calculate true runway (months of survival if revenue stopped).
            </p>
          </div>
          <Button
            variant="outline"
            onClick={saveCash}
            disabled={cashSaving}
            className="mb-[22px]"
          >
            {cashSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save
          </Button>
        </div>
      </Card>

      {/* Category rollup */}
      {byCategory.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly burn by category</h3>
          <div className="space-y-2">
            {byCategory.map(([cat, amt]) => {
              const pct = monthlyBurn > 0 ? (amt / monthlyBurn) * 100 : 0;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <div className="w-44 text-sm text-gray-600 truncate">{CAT_LABEL[cat] || cat}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-24 text-right text-sm font-medium text-gray-900">{fmtMoney(amt)}</div>
                  <div className="w-12 text-right text-xs text-gray-400">{pct.toFixed(0)}%</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Expense list */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            <Receipt className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            No expenses logged yet. Add payroll, rent, software, debt and other costs so Frank can show true net profit.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Expense</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Frequency</th>
                  <th className="px-4 py-3 font-medium text-right">~ / month</th>
                  <th className="px-4 py-3 font-medium text-center">Active</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => {
                  const monthly = (e.amount_cents / 100) * (MONTHLY_FACTOR[e.frequency] ?? 0);
                  return (
                    <tr
                      key={e.id}
                      className={`border-b border-gray-50 ${e.is_active ? '' : 'opacity-50'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{e.label}</div>
                        {e.vendor && <div className="text-xs text-gray-400">{e.vendor}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{CAT_LABEL[e.category] || e.category}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {fmtMoney(e.amount_cents / 100)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{FREQ_LABEL[e.frequency] || e.frequency}</td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {e.frequency === 'one_time' ? '—' : fmtMoney(monthly)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Switch checked={e.is_active} onCheckedChange={() => toggleActive(e)} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(e)} className="h-8 w-8 p-0">
                          <Pencil className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteExpense(e)} className="h-8 w-8 p-0">
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit expense' : 'Add expense'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-sm">Label</Label>
              <Input
                className="mt-1"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder='e.g. "Office rent", "Assistant salary", "SBA loan"'
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Amount</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="pl-7"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm">
                  {form.frequency === 'one_time' ? 'Date' : 'Start date'}
                </Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={form.expense_date}
                  onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Vendor (optional)</Label>
                <Input
                  className="mt-1"
                  value={form.vendor}
                  onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                  placeholder="e.g. WeWork, Gusto"
                />
              </div>
              {form.frequency !== 'one_time' && (
                <div>
                  <Label className="text-sm">End date (optional)</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={form.end_date}
                    onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="text-sm">Notes (optional)</Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              <Label className="text-sm text-gray-600">
                Active (counts toward monthly burn)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              <X className="h-4 w-4 mr-1.5" /> Cancel
            </Button>
            <Button onClick={saveExpense} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              {editingId ? 'Save changes' : 'Add expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExpensesManager;
