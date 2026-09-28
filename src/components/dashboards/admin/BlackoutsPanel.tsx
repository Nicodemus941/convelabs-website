/**
 * BLACKOUTS & BREAKS — Settings tab.
 *
 * Until now there was no one place to answer "when are we not taking
 * bookings?". Office hours lived in Settings, one-off blackouts were created
 * from the admin calendar, and recurring blocks were buried in Staff
 * Management next to individual time off. Nothing showed the whole picture,
 * and a lunch break could not be expressed at all.
 *
 * Everything here writes `time_blocks`, which is what the booking guards
 * actually read — the patient date picker and slot grid, the server
 * availability engine, the checkout and verify guards, both admin modals and
 * the recurring-series builder.
 *
 * WHY LUNCH IS SAVED AS block_type='office_closure':
 * the checkout and verify guards filter on that value specifically. A block
 * saved under a new 'lunch' type would grey the slot out in the grid but
 * would NOT be refused at checkout, so a stale bundle or a direct API call
 * could still book straight through lunch. Reusing office_closure means every
 * existing guard honors it with no further change, and `reason` carries the
 * label so the row is still readable. The office IS closed during lunch.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Trash2, CalendarOff, Coffee, Plus, AlertTriangle, Repeat } from 'lucide-react';
import { DAY_NAMES } from '@/lib/officeHours';
import { timeBlockAppliesOn, type TimeBlockRow } from '@/lib/timeBlocks';

interface BlockRow extends TimeBlockRow {
  id: string;
  created_at?: string | null;
}

const LUNCH_REASON = 'Lunch break';
/** Weekday keys as the existing staff time-off UI writes them. */
const RECURRING_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** 'HH:MM' (what <input type="time"> gives) → '9:00 AM'.
 *  The stored format is 12-hour because every existing reader parses that:
 *  the slot grid's regex is /^(\d{1,2}):(\d{2})\s*(AM|PM)$/ and a 24-hour
 *  string silently fails it, which would drop the block with no error. */
function to12h(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  let h = parseInt(m[1], 10);
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${h}:${m[2]} ${period}`;
}

/** '9:00 AM' → 'HH:MM' for the time input. */
function to24h(t: string | null | undefined): string {
  if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(t).trim());
  if (!m) return String(t).slice(0, 5);
  let h = parseInt(m[1], 10);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface Props {
  /** Latest closing time across open days, 'HH:MM'. Used to warn when a
   *  blackout window sits entirely outside business hours and so does nothing. */
  latestClose?: string | null;
}

const BlackoutsPanel: React.FC<Props> = ({ latestClose }) => {
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Lunch: one window applied to the days you tick.
  const [lunchDays, setLunchDays] = useState<Set<string>>(new Set());
  const [lunchStart, setLunchStart] = useState('12:00');
  const [lunchEnd, setLunchEnd] = useState('13:00');
  const [savingLunch, setSavingLunch] = useState(false);

  // One-off blackout
  const [bStart, setBStart] = useState('');
  const [bEnd, setBEnd] = useState('');
  const [bFrom, setBFrom] = useState('');
  const [bTo, setBTo] = useState('');
  const [bReason, setBReason] = useState('');
  const [addingBlackout, setAddingBlackout] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('time_blocks' as any)
        .select('id, start_date, end_date, start_time, end_time, block_type, reason, recurring, recurring_day, staff_id, created_at')
        .order('start_date', { ascending: false });
      if (error) throw error;
      setBlocks((data as any[] as BlockRow[]) || []);
    } catch (e: any) {
      // Say the load failed. An empty list that actually means "the query
      // broke" is how the provider Patients tab spent months telling
      // practices they had no patients.
      toast.error(`Couldn't load blackouts: ${e?.message || 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Hydrate the lunch editor from whatever recurring lunch rows already exist.
  const existingLunch = useMemo(
    () => blocks.filter(b => b.recurring && b.reason === LUNCH_REASON && b.start_time && b.end_time),
    [blocks],
  );
  useEffect(() => {
    if (existingLunch.length === 0) return;
    setLunchDays(new Set(existingLunch.map(b => String(b.recurring_day || '').toLowerCase())));
    setLunchStart(to24h(existingLunch[0].start_time));
    setLunchEnd(to24h(existingLunch[0].end_time));
  }, [existingLunch.length]);

  const saveLunch = async () => {
    if (lunchDays.size > 0 && lunchStart >= lunchEnd) {
      toast.error('Lunch has to end after it starts.');
      return;
    }
    setSavingLunch(true);
    try {
      // Replace rather than patch: the set of days can shrink, and a day that
      // was unticked must stop blocking.
      const stale = existingLunch.map(b => b.id);
      if (stale.length > 0) {
        const { error } = await supabase.from('time_blocks' as any).delete().in('id', stale as any);
        if (error) throw error;
      }
      if (lunchDays.size > 0) {
        const today = todayIso();
        const rows = Array.from(lunchDays).map(day => ({
          // start_date = end_date is how the staff UI saves a recurring block,
          // and timeBlockAppliesOn reads an equal pair as "no end", so the
          // block repeats indefinitely from today.
          start_date: today,
          end_date: today,
          start_time: to12h(lunchStart),
          end_time: to12h(lunchEnd),
          block_type: 'office_closure',
          reason: LUNCH_REASON,
          recurring: true,
          recurring_day: day,
        }));
        const { error } = await supabase.from('time_blocks' as any).insert(rows as any);
        if (error) throw error;
      }
      toast.success(lunchDays.size > 0
        ? `Lunch break saved · ${lunchDays.size} day${lunchDays.size === 1 ? '' : 's'}`
        : 'Lunch break removed');
      await load();
    } catch (e: any) {
      toast.error(`Couldn't save lunch break: ${e?.message || 'unknown error'}`);
    } finally {
      setSavingLunch(false);
    }
  };

  const addBlackout = async () => {
    if (!bStart) { toast.error('Pick a start date.'); return; }
    if (!!bFrom !== !!bTo) { toast.error('Give both a start and end time, or neither for a full day.'); return; }
    if (bFrom && bTo && bFrom >= bTo) { toast.error('The end time has to be after the start time.'); return; }
    setAddingBlackout(true);
    try {
      const { error } = await supabase.from('time_blocks' as any).insert({
        start_date: bStart,
        end_date: bEnd || bStart,
        start_time: bFrom ? to12h(bFrom) : null,
        end_time: bTo ? to12h(bTo) : null,
        block_type: 'office_closure',
        reason: bReason || 'Blocked',
        recurring: false,
      } as any);
      if (error) throw error;
      toast.success(bFrom ? `Blocked ${bFrom}–${bTo} on ${bStart}` : `Blocked ${bStart}${bEnd && bEnd !== bStart ? ` – ${bEnd}` : ''}`);
      setBStart(''); setBEnd(''); setBFrom(''); setBTo(''); setBReason('');
      await load();
    } catch (e: any) {
      toast.error(`Couldn't add blackout: ${e?.message || 'unknown error'}`);
    } finally {
      setAddingBlackout(false);
    }
  };

  const removeBlock = async (id: string) => {
    setBusy(id);
    try {
      const { error } = await (supabase.from('time_blocks' as any).delete() as any).eq('id', id);
      if (error) throw error;
      setBlocks(prev => prev.filter(b => b.id !== id));
      toast.success('Removed');
    } catch (e: any) {
      toast.error(`Couldn't remove: ${e?.message || 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  };

  const today = todayIso();
  // Past one-off blocks are noise; recurring ones never expire so they always
  // belong on screen.
  const active = blocks.filter(b => b.recurring || b.end_date >= today);
  const past = blocks.filter(b => !b.recurring && b.end_date < today);

  // A window that starts at or after closing can never remove a bookable slot.
  const uselessWindow = (b: BlockRow) => {
    if (!b.start_time || !latestClose) return false;
    return to24h(b.start_time) >= latestClose;
  };

  return (
    <div className="space-y-6">
      {/* ── LUNCH ───────────────────────────────────────────── */}
      <Card className="border-[#EFE3E1]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Coffee className="h-4 w-4 text-[#B91C1C]" /> Lunch break
          </CardTitle>
          <CardDescription className="text-xs">
            Repeats every week on the days you pick. Patients can't book these times, and checkout refuses them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {RECURRING_DAYS.map((day, i) => {
              const on = lunchDays.has(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setLunchDays(prev => {
                    const next = new Set(prev);
                    if (next.has(day)) next.delete(day); else next.add(day);
                    return next;
                  })}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition ${
                    on ? 'border-[#B91C1C] bg-[#B91C1C] text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {DAY_NAMES[i].slice(0, 3)}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="time" value={lunchStart} onChange={e => setLunchStart(e.target.value)} className="w-32" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="time" value={lunchEnd} onChange={e => setLunchEnd(e.target.value)} className="w-32" />
            </div>
            <Button onClick={saveLunch} disabled={savingLunch} size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
              {savingLunch ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {lunchDays.size === 0 && existingLunch.length > 0 ? 'Remove lunch break' : 'Save lunch break'}
            </Button>
          </div>
          {latestClose && lunchStart >= latestClose && lunchDays.size > 0 && (
            <p className="text-xs text-amber-700 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              You close at {latestClose}, so a lunch starting {lunchStart} wouldn't remove any bookable time.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── ADD A BLACKOUT ──────────────────────────────────── */}
      <Card className="border-[#EFE3E1]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-[#B91C1C]" /> Block dates or times
          </CardTitle>
          <CardDescription className="text-xs">
            Leave both times empty to close the whole day. Existing appointments are not cancelled — reschedule those yourself.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div>
              <Label className="text-xs">Start date</Label>
              <Input type="date" value={bStart} min={today} onChange={e => setBStart(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">End date</Label>
              <Input type="date" value={bEnd} min={bStart || today} onChange={e => setBEnd(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">From (optional)</Label>
              <Input type="time" value={bFrom} onChange={e => setBFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To (optional)</Label>
              <Input type="time" value={bTo} onChange={e => setBTo(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Reason</Label>
              <Input value={bReason} onChange={e => setBReason(e.target.value)} placeholder="Holiday, training, conference…" />
            </div>
          </div>
          <Button onClick={addBlackout} disabled={addingBlackout} size="sm" className="mt-3 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1">
            {addingBlackout ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add blackout
          </Button>
        </CardContent>
      </Card>

      {/* ── WHAT IS BLOCKED ─────────────────────────────────── */}
      <Card className="border-[#EFE3E1]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Currently blocked</CardTitle>
          <CardDescription className="text-xs">
            {loading ? 'Loading…' : `${active.length} active · ${past.length} past`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-[#B91C1C]" /></div>
          ) : active.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-7">Nothing is blocked. Every open hour is bookable.</p>
          ) : (
            <ul className="divide-y">
              {active.map(b => (
                <li key={b.id} className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">
                        {b.recurring
                          ? `Every ${String(b.recurring_day || '').replace(/^./, c => c.toUpperCase())}`
                          : b.start_date === b.end_date ? b.start_date : `${b.start_date} → ${b.end_date}`}
                      </span>
                      {b.recurring && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#B91C1C]/10 text-[#B91C1C] inline-flex items-center gap-1">
                          <Repeat className="h-2.5 w-2.5" /> Weekly
                        </span>
                      )}
                      {b.staff_id && (
                        // Worth saying out loud: staff_id is not yet honored on
                        // read, so this blocks everyone, not just that person.
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          Blocks everyone
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {b.start_time && b.end_time ? `${b.start_time} – ${b.end_time}` : 'All day'}
                      {b.reason ? ` · ${b.reason}` : ''}
                    </p>
                    {uselessWindow(b) && (
                      <p className="text-[11px] text-amber-700 mt-1 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                        Starts after you close, so it blocks nothing.
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => removeBlock(b.id)}
                    disabled={busy === b.id}
                    className="text-gray-400 hover:text-[#B91C1C] flex-shrink-0"
                    aria-label="Remove block"
                  >
                    {busy === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BlackoutsPanel;
