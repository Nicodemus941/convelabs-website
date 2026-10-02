/**
 * chartModalKit — the one modal language for everything launched from the
 * patient chart (and reused by the shared send modals).
 *
 *   • ModalTitle        titled header with the patient as context
 *   • ReviewList/Row    "exactly what will happen" summary before a send/charge
 *   • QuietHoursNotice  9 PM–8 AM ET wording on anything that messages a patient
 *   • ConfirmDialog     review → confirm step, with loading / error states
 *   • ResultPanel       success state with a single Done action
 *
 * Nothing here sends anything itself.
 */

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Loader2, MoonStar } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────
// Quiet hours — 9 PM to 8 AM Eastern (mirrors supabase/functions/_shared/quiet-hours.ts)
// ──────────────────────────────────────────────────────────────────
const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 8;

export function hourInET(now: Date = new Date()): number {
  try {
    const h = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(now);
    const n = parseInt(h, 10);
    return Number.isFinite(n) ? n % 24 : now.getHours();
  } catch {
    return now.getHours();
  }
}

export function isQuietHoursET(now: Date = new Date()): boolean {
  const h = hourInET(now);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/** One line to put under any patient-facing send. */
export const QUIET_HOURS_LINE = 'Patient messages are not sent between 9 PM and 8 AM ET.';

export const QuietHoursNotice: React.FC<{ channels?: string; className?: string }> = ({ channels = 'SMS and email', className }) => {
  const quiet = isQuietHoursET();
  return (
    <div
      className={cn(
        'rounded-md border p-2.5 text-xs flex items-start gap-2',
        quiet ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-200 bg-gray-50 text-gray-600',
        className,
      )}
      role={quiet ? 'alert' : undefined}
    >
      <MoonStar className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <p>
        {quiet
          ? <><span className="font-semibold">It is quiet hours right now (9 PM–8 AM ET).</span> This is a manual send and goes out immediately by {channels} — unless it is urgent, wait until 8 AM ET.</>
          : <>Sends immediately by {channels}. {QUIET_HOURS_LINE}</>}
      </p>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// Header
// ──────────────────────────────────────────────────────────────────
export const ModalTitle: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  /** Patient context line — name · phone · email. */
  context?: React.ReactNode;
  tone?: 'default' | 'danger';
}> = ({ icon: Icon, title, context, tone = 'default' }) => (
  <DialogHeader className="text-left space-y-1">
    <DialogTitle className="flex items-center gap-2 text-base sm:text-lg text-gray-900">
      {Icon && <Icon className={cn('h-5 w-5 flex-shrink-0', tone === 'danger' ? 'text-red-600' : 'text-[#B91C1C]')} />}
      <span className="min-w-0 truncate">{title}</span>
    </DialogTitle>
    {context && <DialogDescription className="text-xs text-gray-500 truncate">{context}</DialogDescription>}
  </DialogHeader>
);

/** "Name · phone · email" — the context line under every chart modal title. */
export function patientContextLine(p: { first_name?: string | null; last_name?: string | null; phone?: string | null; email?: string | null } | null | undefined): string {
  if (!p) return '';
  const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return [name, p.phone, p.email].filter(Boolean).join(' · ');
}

// ──────────────────────────────────────────────────────────────────
// Review summary
// ──────────────────────────────────────────────────────────────────
export const ReviewList: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <dl className={cn('rounded-lg border border-gray-200 bg-gray-50 divide-y divide-gray-200 text-sm', className)}>{children}</dl>
);

export const ReviewRow: React.FC<{ label: string; children: React.ReactNode; tone?: 'default' | 'warn' | 'strong' }> = ({ label, children, tone = 'default' }) => (
  <div className="grid grid-cols-[110px_1fr] gap-3 px-3 py-2">
    <dt className="text-xs text-gray-500 pt-0.5">{label}</dt>
    <dd className={cn('min-w-0 break-words', tone === 'warn' && 'text-amber-800', tone === 'strong' && 'font-semibold text-gray-900')}>{children}</dd>
  </div>
);

export const InlineError: React.FC<{ message: string | null | undefined; className?: string }> = ({ message, className }) =>
  message ? (
    <div className={cn('rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 whitespace-pre-wrap flex items-start gap-2', className)} role="alert">
      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <span>{message}</span>
    </div>
  ) : null;

// ──────────────────────────────────────────────────────────────────
// Confirm dialog — review step before anything that sends or charges
// ──────────────────────────────────────────────────────────────────
export const ConfirmDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  context?: React.ReactNode;
  /** Review rows / explanation. */
  children?: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
  /** Show the quiet-hours wording (anything that texts/emails the patient). */
  quietHours?: boolean | string;
  size?: 'sm' | 'md';
}> = ({ open, onOpenChange, icon, title, context, children, confirmLabel, cancelLabel = 'Cancel', tone = 'primary', busy, busyLabel = 'Working…', disabled, error, onConfirm, quietHours, size = 'sm' }) => (
  <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
    <DialogContent className={cn('w-[95vw]', size === 'sm' ? 'max-w-md' : 'max-w-lg')}>
      <ModalTitle icon={icon} title={title} context={context} tone={tone === 'danger' ? 'danger' : 'default'} />
      <div className="space-y-3">
        {children}
        {quietHours && <QuietHoursNotice channels={typeof quietHours === 'string' ? quietHours : undefined} />}
        <InlineError message={error} />
      </div>
      <div className="flex items-center justify-end gap-2 pt-3 border-t">
        <Button variant="outline" className="h-10 sm:h-9" onClick={() => onOpenChange(false)} disabled={busy}>{cancelLabel}</Button>
        <Button
          className={cn('h-10 sm:h-9 text-white gap-1.5', tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#B91C1C] hover:bg-[#991B1B]')}
          onClick={() => void onConfirm()}
          disabled={busy || disabled}
        >
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {busyLabel}</> : confirmLabel}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

// ──────────────────────────────────────────────────────────────────
// Success panel
// ──────────────────────────────────────────────────────────────────
export const ResultPanel: React.FC<{
  title: string;
  detail?: React.ReactNode;
  children?: React.ReactNode;
  onDone: () => void;
  doneLabel?: string;
}> = ({ title, detail, children, onDone, doneLabel = 'Done' }) => (
  <div className="space-y-4">
    <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center">
      <CheckCircle2 className="h-9 w-9 text-emerald-600 mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm font-bold text-emerald-900">{title}</p>
      {detail && <div className="text-xs text-emerald-700 mt-1">{detail}</div>}
    </div>
    {children}
    <Button variant="outline" className="w-full h-10 sm:h-9" onClick={onDone}>{doneLabel}</Button>
  </div>
);

/** Section label used inside modals. */
export const FieldGroup: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ label, hint, children, className }) => (
  <div className={cn('rounded-lg border border-gray-200 p-3 space-y-2', className)}>
    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1.5">
      {label}{hint && <span className="text-gray-400 normal-case font-normal">{hint}</span>}
    </p>
    {children}
  </div>
);
