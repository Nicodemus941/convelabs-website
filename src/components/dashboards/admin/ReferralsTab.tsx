/**
 * REFERRALS — Owner › Referrals (owner-gated in Dashboard.tsx).
 *
 * The "Give $25, Get $25" program end to end, on one screen:
 *   - Codes:       every referral_codes row and who owns it
 *   - Redemptions: every booking that used a code (referral_redemptions)
 *   - Credits:     every referral_credits row — available / redeemed / expired
 *
 * Read-only. The owner uses this to answer "did the credit land?" without a
 * SQL console. Identity note: referral_codes.user_id and referral_credits
 * .user_id hold EITHER tenant_patients.id OR the auth user id (two code-
 * minting paths), so owners are resolved on both columns here, exactly as
 * create-appointment-checkout and the webhook do.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Gift, RefreshCw, Search, X, Users, Ticket, Wallet, Clock } from 'lucide-react';
import {
  SectionHeader, SectionTitle, KpiTile, FilterChips, Pill, LoadingRows, LoadingTiles, EmptyState, ErrorBanner, Th,
  type ChipDef,
} from './owner/sectionUi';

/** Credits are good for 12 months from the day they were earned. */
export const REFERRAL_CREDIT_TTL_DAYS = 365;

interface CodeRow { id: string; user_id: string | null; code: string; discount_amount: number | null; referrer_credit: number | null; uses: number | null; max_uses: number | null; active: boolean | null; created_at: string }
interface RedemptionRow { id: string; referral_code_id: string | null; referred_email: string | null; appointment_id: string | null; discount_applied: number | null; referrer_credited: boolean | null; created_at: string }
interface CreditRow { id: string; user_id: string | null; amount: number | null; type: string | null; referral_code_id: string | null; appointment_id: string | null; description: string | null; redeemed: boolean | null; redeemed_at: string | null; created_at: string }
interface PatientRow { id: string; user_id: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }

type View = 'credits' | 'codes' | 'redemptions';
type CreditState = 'available' | 'redeemed' | 'expired';

const dollars = (n: number) => `$${(n || 0).toFixed(2)}`;
const when = (iso: string | null | undefined) => (iso ? format(new Date(iso), 'MMM d, yyyy') : '—');
const expiresAt = (c: CreditRow) => new Date(new Date(c.created_at).getTime() + REFERRAL_CREDIT_TTL_DAYS * 24 * 3600 * 1000);
export const creditState = (c: CreditRow, now = new Date()): CreditState =>
  c.redeemed ? 'redeemed' : expiresAt(c) <= now ? 'expired' : 'available';

const STATE_PILL: Record<CreditState, string> = {
  available: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  redeemed: 'bg-gray-100 text-gray-700 border-gray-200',
  expired: 'bg-amber-100 text-amber-800 border-amber-200',
};

const VIEW_CHIPS: Array<ChipDef<View>> = [
  { key: 'credits', label: 'Credits', desc: 'Every $25 earned, and whether it was applied' },
  { key: 'codes', label: 'Codes', desc: 'Referral codes patients can share' },
  { key: 'redemptions', label: 'Redemptions', desc: 'Bookings that used a code' },
];

const ReferralsTab: React.FC = () => {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [patients, setPatients] = useState<Map<string, PatientRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('credits');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, r, k] = await Promise.all([
        supabase.from('referral_codes' as never).select('*').order('created_at', { ascending: false }).limit(1000),
        supabase.from('referral_redemptions' as never).select('*').order('created_at', { ascending: false }).limit(1000),
        supabase.from('referral_credits' as never).select('*').order('created_at', { ascending: false }).limit(1000),
      ]);
      if (c.error) throw c.error;
      if (r.error) throw r.error;
      if (k.error) throw k.error;
      const codeRows = (c.data as unknown as CodeRow[]) || [];
      const creditRows = (k.data as unknown as CreditRow[]) || [];
      setCodes(codeRows);
      setRedemptions((r.data as unknown as RedemptionRow[]) || []);
      setCredits(creditRows);

      // Resolve owners on both identity columns.
      const ids = Array.from(new Set([...codeRows, ...creditRows].map(x => x.user_id).filter((v): v is string => !!v)));
      const map = new Map<string, PatientRow>();
      if (ids.length > 0) {
        const [byId, byUser] = await Promise.all([
          supabase.from('tenant_patients').select('id, user_id, first_name, last_name, email, phone').in('id', ids as any),
          supabase.from('tenant_patients').select('id, user_id, first_name, last_name, email, phone').in('user_id', ids as any),
        ]);
        for (const p of ((byId.data || []) as PatientRow[])) map.set(p.id, p);
        for (const p of ((byUser.data || []) as PatientRow[])) if (p.user_id) map.set(p.user_id, p);
      }
      setPatients(map);
    } catch (e: any) {
      console.error('[ReferralsTab] load failed:', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const owner = useCallback((userId: string | null) => (userId ? patients.get(userId) || null : null), [patients]);
  const ownerName = useCallback((userId: string | null) => {
    const p = owner(userId);
    if (!p) return userId ? `Unknown patient (${userId.slice(0, 8)})` : 'No owner';
    const n = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    return n || p.email || p.id.slice(0, 8);
  }, [owner]);
  const codeById = useMemo(() => new Map(codes.map(c => [c.id, c])), [codes]);

  const kpis = useMemo(() => {
    const now = new Date();
    let available = 0, redeemed = 0, expired = 0, availableCount = 0;
    for (const c of credits) {
      const s = creditState(c, now);
      const amt = Number(c.amount || 0);
      if (s === 'available') { available += amt; availableCount++; }
      else if (s === 'redeemed') redeemed += amt;
      else expired += amt;
    }
    return { available, availableCount, redeemed, expired, codes: codes.length, activeCodes: codes.filter(c => c.active !== false).length, redemptions: redemptions.length };
  }, [credits, codes, redemptions]);

  const q = search.trim().toLowerCase();
  const matches = (parts: Array<string | null | undefined>) => q === '' || parts.some(p => (p || '').toLowerCase().includes(q));

  const filteredCredits = useMemo(() => credits.filter(c => {
    const p = owner(c.user_id);
    return matches([ownerName(c.user_id), p?.email, p?.phone, c.description, c.type, codeById.get(c.referral_code_id || '')?.code]);
  }), [credits, owner, ownerName, codeById, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredCodes = useMemo(() => codes.filter(c => {
    const p = owner(c.user_id);
    return matches([c.code, ownerName(c.user_id), p?.email, p?.phone]);
  }), [codes, owner, ownerName, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredRedemptions = useMemo(() => redemptions.filter(r => {
    const code = codeById.get(r.referral_code_id || '');
    return matches([r.referred_email, code?.code, code ? ownerName(code.user_id) : null]);
  }), [redemptions, codeById, ownerName, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts: Record<View, number> = { credits: credits.length, codes: codes.length, redemptions: redemptions.length };

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Gift}
        title="Referrals"
        subtitle={<>Give $25, get $25. Credits auto-apply at the referrer's next checkout and expire after {REFERRAL_CREDIT_TTL_DAYS} days.</>}
        actions={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        }
      />

      {error && <ErrorBanner title="Could not load referrals" message={error} onRetry={load} />}

      {loading ? <LoadingTiles n={4} /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <KpiTile label="Credit outstanding" value={dollars(kpis.available)} hint={`${kpis.availableCount} unredeemed credit${kpis.availableCount === 1 ? '' : 's'}`} tone="brand" icon={Wallet} />
          <KpiTile label="Credit redeemed" value={dollars(kpis.redeemed)} hint="Applied to bookings" tone="green" icon={Gift} />
          <KpiTile label="Codes shared" value={kpis.activeCodes} hint={`${kpis.codes} issued · ${kpis.redemptions} redemption${kpis.redemptions === 1 ? '' : 's'}`} icon={Ticket} />
          <KpiTile label="Credit expired" value={dollars(kpis.expired)} hint={`Unused after ${REFERRAL_CREDIT_TTL_DAYS} days`} tone={kpis.expired > 0 ? 'amber' : 'default'} icon={Clock} />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <FilterChips chips={VIEW_CHIPS} counts={counts} active={view} onSelect={setView} label="View" />
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Patient, email, phone, code…" className="pl-8 pr-8 h-10 sm:h-9 text-sm" aria-label="Search referrals" />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {loading ? <LoadingRows rows={6} label="Loading referrals" /> : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {view === 'credits' && (
              filteredCredits.length === 0
                ? <div className="p-4"><EmptyState icon={Wallet} title="No referral credits yet" hint="A credit is created the moment a friend's booking with a referral code is paid." /></div>
                : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b"><tr>
                      <Th>Patient</Th><Th>Amount</Th><Th>Status</Th><Th>Earned</Th><Th>Expires / redeemed</Th><Th>Source</Th>
                    </tr></thead>
                    <tbody>
                      {filteredCredits.map(c => {
                        const s = creditState(c);
                        const p = owner(c.user_id);
                        return (
                          <tr key={c.id} className="border-b last:border-0 align-top">
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-900">{ownerName(c.user_id)}</div>
                              {p?.email && <div className="text-xs text-gray-500">{p.email}</div>}
                            </td>
                            <td className="px-3 py-2 tabular-nums font-semibold">{dollars(Number(c.amount || 0))}</td>
                            <td className="px-3 py-2"><Pill className={STATE_PILL[s]}>{s}</Pill></td>
                            <td className="px-3 py-2 whitespace-nowrap">{when(c.created_at)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{s === 'redeemed' ? when(c.redeemed_at) : when(expiresAt(c).toISOString())}</td>
                            <td className="px-3 py-2 text-xs text-gray-600 max-w-[22rem]">
                              <span className="font-mono">{codeById.get(c.referral_code_id || '')?.code || c.type || '—'}</span>
                              {c.description && <div className="text-gray-500 mt-0.5">{c.description}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
            )}

            {view === 'codes' && (
              filteredCodes.length === 0
                ? <div className="p-4"><EmptyState icon={Ticket} title="No referral codes" hint="Codes are minted when a first-time patient's visit is completed." /></div>
                : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b"><tr>
                      <Th>Code</Th><Th>Owner</Th><Th>Friend gets</Th><Th>Owner earns</Th><Th>Uses</Th><Th>Status</Th><Th>Created</Th>
                    </tr></thead>
                    <tbody>
                      {filteredCodes.map(c => {
                        const p = owner(c.user_id);
                        return (
                          <tr key={c.id} className="border-b last:border-0 align-top">
                            <td className="px-3 py-2 font-mono font-semibold text-[#B91C1C]">{c.code}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-900">{ownerName(c.user_id)}</div>
                              {p?.email && <div className="text-xs text-gray-500">{p.email}</div>}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{dollars(Number(c.discount_amount ?? 25))}</td>
                            <td className="px-3 py-2 tabular-nums">{dollars(Number(c.referrer_credit ?? 25))}</td>
                            <td className="px-3 py-2 tabular-nums">{c.uses || 0}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                            <td className="px-3 py-2"><Pill className={c.active === false ? 'bg-gray-100 text-gray-700 border-gray-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}>{c.active === false ? 'inactive' : 'active'}</Pill></td>
                            <td className="px-3 py-2 whitespace-nowrap">{when(c.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
            )}

            {view === 'redemptions' && (
              filteredRedemptions.length === 0
                ? <div className="p-4"><EmptyState icon={Users} title="No redemptions yet" hint="A redemption is recorded when a booking that used a referral code is paid." /></div>
                : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b"><tr>
                      <Th>Friend</Th><Th>Code</Th><Th>Referrer</Th><Th>Friend saved</Th><Th>Referrer credited</Th><Th>Booked</Th>
                    </tr></thead>
                    <tbody>
                      {filteredRedemptions.map(r => {
                        const code = codeById.get(r.referral_code_id || '');
                        return (
                          <tr key={r.id} className="border-b last:border-0 align-top">
                            <td className="px-3 py-2">{r.referred_email || '—'}</td>
                            <td className="px-3 py-2 font-mono">{code?.code || '—'}</td>
                            <td className="px-3 py-2">{code ? ownerName(code.user_id) : '—'}</td>
                            <td className="px-3 py-2 tabular-nums">{dollars(Number(r.discount_applied || 0))}</td>
                            <td className="px-3 py-2"><Pill className={r.referrer_credited ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}>{r.referrer_credited ? 'yes' : 'pending'}</Pill></td>
                            <td className="px-3 py-2 whitespace-nowrap">{when(r.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
            )}
          </CardContent>
        </Card>
      )}

      <SectionTitle hint="Credits are matched by email at checkout and applied before the card is charged.">How it works</SectionTitle>
      <p className="text-xs text-gray-500 -mt-2">
        Patient completes a first visit → code is minted and texted 14 days later → a friend books with <span className="font-mono">?ref=CODE</span> or types it at checkout and saves $25 → when that booking is paid the referrer earns a $25 credit → the credit is auto-applied on the referrer's next online booking (or offered in the admin booking modal).
      </p>
    </div>
  );
};

export default ReferralsTab;
