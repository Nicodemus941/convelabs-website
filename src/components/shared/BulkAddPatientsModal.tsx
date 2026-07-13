import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_TENANT_ID } from '@/lib/tenantConstants';
import { toast } from 'sonner';
import { Loader2, Users, AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * BulkAddPatientsModal — paste-list bulk patient creation.
 *
 * The Hormozi force-multiplier for clinical coordinators (Lara at Littleton,
 * Dianelis at Aristotle): a 3-doctor practice has 30+ patients waiting on
 * labs. Adding them one-by-one through AddPatientModal is a 30-minute slog.
 * Paste a list → preview → bulk insert turns it into a 90-second job.
 *
 * Accepted line formats (whitespace + comma + tab + pipe all work):
 *   Jane Doe, jane@example.com, (407) 555-1234
 *   John Smith\tjohn@x.com\t4075551111
 *   Mary Jones | 4075552222
 *   Robert Brown bob@x.com
 *
 * Rules:
 *   - First two whitespace-split tokens are first/last name (required)
 *   - Anything containing "@" is email
 *   - Anything with ≥7 digits is phone
 *   - Phone OR email required per row
 *   - Duplicate detection happens server-side via tenant_patients unique
 *     index — we surface those errors inline.
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  onCreated?: () => void;
}

interface ParsedRow {
  raw: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  error: string | null;
}

const parseLine = (line: string): ParsedRow => {
  const raw = line.trim();
  if (!raw) {
    return { raw, firstName: '', lastName: '', email: null, phone: null, error: 'empty' };
  }
  // Split on commas, tabs, or pipes; keep whitespace tokens for name capture
  const parts = raw.split(/[,\t|]/).map(p => p.trim()).filter(Boolean);

  let email: string | null = null;
  let phone: string | null = null;
  const nameTokens: string[] = [];

  for (const part of parts) {
    if (part.includes('@')) {
      email = part.toLowerCase();
    } else if (/\d/.test(part) && part.replace(/\D/g, '').length >= 7) {
      phone = part.replace(/[^\d+]/g, '');
    } else {
      nameTokens.push(part);
    }
  }

  // If no separators, fall back to whitespace split for the name + scan tokens
  if (nameTokens.length === 0 && parts.length === 1) {
    const tokens = raw.split(/\s+/);
    const nameWords: string[] = [];
    for (const tok of tokens) {
      if (tok.includes('@')) email = tok.toLowerCase();
      else if (/\d/.test(tok) && tok.replace(/\D/g, '').length >= 7) phone = tok.replace(/[^\d+]/g, '');
      else nameWords.push(tok);
    }
    nameTokens.push(nameWords.join(' '));
  }

  const fullName = nameTokens.join(' ').trim();
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  let error: string | null = null;
  if (!firstName || !lastName) error = 'Need first + last name';
  else if (!email && !phone) error = 'Need phone or email';

  return { raw, firstName, lastName, email, phone, error };
};

const BulkAddPatientsModal: React.FC<Props> = ({ open, onOpenChange, organizationId, onCreated }) => {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);

  const parsed = useMemo(() => {
    return text.split(/\r?\n/).map(parseLine).filter(r => r.raw);
  }, [text]);

  const valid = parsed.filter(r => !r.error);
  const invalid = parsed.filter(r => r.error);

  const reset = () => {
    setText('');
    setResults(null);
  };

  const submit = async () => {
    if (valid.length === 0) {
      toast.error('Add at least one valid row');
      return;
    }

    setSubmitting(true);
    setResults(null);
    try {
      // Default 7-day reminder cadence for the no-show killer flow
      const days = 7;
      const deadlineAt = new Date();
      deadlineAt.setDate(deadlineAt.getDate() + days);

      const rows = valid.map(r => ({
        // tenant_id is NOT NULL with no DB default — omitting it 23502s every
        // insert (fixed 2026-07-13 alongside the CSV importer).
        tenant_id: DEFAULT_TENANT_ID,
        first_name: r.firstName,
        last_name: r.lastName,
        email: r.email,
        phone: r.phone,
        organization_id: organizationId,
        lab_reminder_cadence_days: days,
        lab_reminder_deadline_at: deadlineAt.toISOString(),
      }));

      // Insert one-at-a-time so a single duplicate doesn't fail the entire batch
      let inserted = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (const row of rows) {
        const { error } = await supabase.from('tenant_patients').insert(row as any);
        if (error) {
          const msg = String(error.message || '').toLowerCase();
          if (msg.includes('duplicate') || msg.includes('unique')) {
            skipped += 1;
            errors.push(`${row.first_name} ${row.last_name}: already on file`);
          } else {
            errors.push(`${row.first_name} ${row.last_name}: ${error.message}`);
          }
        } else {
          inserted += 1;
        }
      }

      setResults({ inserted, skipped, errors });
      if (inserted > 0) {
        toast.success(`Added ${inserted} patient${inserted === 1 ? '' : 's'}${skipped > 0 ? ` · ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped` : ''}`);
        onCreated?.();
      } else if (skipped > 0) {
        toast.info(`All ${skipped} already on file`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Bulk add failed');
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    if (submitting) return;
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { if (!v) reset(); onOpenChange(v); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#B91C1C]" />
            Bulk add patients
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 leading-relaxed">
            <p className="font-semibold mb-1">Paste one patient per line</p>
            <p>
              Any combination of name + email + phone, separated by commas, tabs, or pipes. Examples:
            </p>
            <pre className="mt-2 p-2 bg-white border border-blue-100 rounded text-[11px] font-mono text-gray-700 overflow-x-auto">
{`Jane Doe, jane@example.com, (407) 555-1234
John Smith    john@x.com    4075551111
Mary Jones | 4075552222
Robert Brown bob@x.com`}
            </pre>
          </div>

          <div>
            <Label className="text-xs font-semibold">Patient list</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={`Jane Doe, jane@example.com, (407) 555-1234\nJohn Smith, john@x.com, 4075551111`}
              className="mt-1 text-sm font-mono"
              disabled={submitting}
            />
            {parsed.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> {valid.length} valid
                </Badge>
                {invalid.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[11px]">
                    <AlertCircle className="h-3 w-3 mr-1" /> {invalid.length} need fixing
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Preview */}
          {parsed.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                Preview ({parsed.length})
              </div>
              <div className="max-h-56 overflow-y-auto divide-y">
                {parsed.map((r, i) => (
                  <div key={i} className={`px-3 py-2 text-xs flex items-start gap-2 ${r.error ? 'bg-amber-50' : ''}`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {r.error ? (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {r.error ? (
                        <>
                          <p className="text-amber-900 font-medium truncate">{r.raw}</p>
                          <p className="text-[10px] text-amber-700">{r.error}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-semibold truncate">{r.firstName} {r.lastName}</p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {r.email || '—'} {r.email && r.phone && '·'} {r.phone || ''}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <p className="font-semibold">
                ✓ {results.inserted} added{results.skipped > 0 ? ` · ${results.skipped} skipped (duplicates)` : ''}
              </p>
              {results.errors.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[11px] text-emerald-800 list-disc pl-5">
                  {results.errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                  {results.errors.length > 8 && <li>+{results.errors.length - 8} more</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={close} disabled={submitting} className="w-full sm:w-auto">
            {results ? 'Close' : 'Cancel'}
          </Button>
          {!results && (
            <Button
              onClick={submit}
              disabled={submitting || valid.length === 0}
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white w-full sm:w-auto"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Adding {valid.length}…</>
                : <>Add {valid.length} patient{valid.length === 1 ? '' : 's'}</>
              }
            </Button>
          )}
          {results && results.inserted > 0 && (
            <Button
              onClick={() => { reset(); }}
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white w-full sm:w-auto"
            >
              Add another batch
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkAddPatientsModal;
