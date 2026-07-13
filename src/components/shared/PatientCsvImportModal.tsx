import React, { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_TENANT_ID } from '@/lib/tenantConstants';
import { toast } from 'sonner';
import { Loader2, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, SkipForward } from 'lucide-react';

/**
 * PatientCsvImportModal — upload a patient-export CSV, map columns, preview
 * per-row verdicts, and bulk-import into tenant_patients.
 *
 * Requested by Elite Medical Concierge (2026-07-13): practices export their
 * patient list from their EHR/CRM as CSV; adding one-by-one through
 * AddPatientModal is a multi-hour slog for a 200-patient roster.
 *
 * Rules (owner-confirmed):
 *   - NAME is the only hard requirement (first + last).
 *   - DOB optional. Phone optional. Email optional. Address optional.
 *   - Rows with NEITHER email NOR phone are excluded by default (no way to
 *     contact or dedupe them) — a toggle lets the provider include them.
 *   - Duplicates (by email, then phone) against existing patients are
 *     skipped, never overwritten. In-file duplicates collapse to the first.
 *
 * Everything parses in the browser; nothing is written until "Import".
 * Inserts are chunked (25/batch) with row-level fallback so one bad row
 * can't sink the batch. Failures download as a CSV to fix + re-upload.
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  onCreated?: () => void;
}

type Field = 'first_name' | 'last_name' | 'full_name' | 'email' | 'phone' | 'dob'
  | 'address' | 'city' | 'state' | 'zipcode' | 'full_address' | 'notes' | 'ignore';

const FIELD_LABELS: Record<Field, string> = {
  first_name: 'First name', last_name: 'Last name', full_name: 'Full name',
  email: 'Email', phone: 'Phone', dob: 'Date of birth',
  address: 'Street address', city: 'City', state: 'State', zipcode: 'ZIP',
  full_address: 'Full address (street, city, state zip)', notes: 'Notes', ignore: '— ignore —',
};

/** Header → field auto-mapping synonyms (lowercased, non-alnum stripped). */
const HEADER_MAP: Array<[RegExp, Field]> = [
  [/^(first|firstname|fname|givenname|patientfirst(name)?)$/, 'first_name'],
  [/^(last|lastname|lname|surname|familyname|patientlast(name)?)$/, 'last_name'],
  [/^(name|fullname|patient|patientname|clientname|member(name)?)$/, 'full_name'],
  [/^(email|emailaddress|patientemail|mail|primaryemail)$/, 'email'],
  [/^(phone|phonenumber|mobile|cell|cellphone|telephone|tel|primaryphone|contactnumber)$/, 'phone'],
  [/^(dob|dateofbirth|birthdate|birthday|born)$/, 'dob'],
  [/^(address|street|streetaddress|address1|addressline1|homeaddress|mailingaddress)$/, 'address'],
  [/^(city|town)$/, 'city'],
  [/^(state|province|st)$/, 'state'],
  [/^(zip|zipcode|postal|postalcode|zip4)$/, 'zipcode'],
  [/^(fulladdress|completeaddress)$/, 'full_address'],
  [/^(notes?|comments?|memo)$/, 'notes'],
];

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

function autoMapHeader(h: string): Field {
  const n = normHeader(h);
  for (const [re, f] of HEADER_MAP) if (re.test(n)) return f;
  return 'ignore';
}

/** Normalize a phone to bare 10 digits (or null). Tolerates +1, punctuation. */
function normPhone(raw: string | undefined | null): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return d;
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  return d.length >= 7 ? d : null; // keep odd-length but plausible numbers as-is
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Parse many DOB formats → 'YYYY-MM-DD' or null (never guess). */
function parseDob(raw: string | undefined | null): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  // ISO already
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const [, y, mo, d] = m;
    return validDate(+y, +mo, +d);
  }
  // M/D/YYYY or M-D-YYYY or M.D.YYYY (US export default)
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) return validDate(+m[3], +m[1], +m[2]);
  // M/D/YY — pivot 2-digit years: >current 2-digit year → 1900s
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/.exec(s);
  if (m) {
    const yy = +m[3];
    const pivot = new Date().getFullYear() % 100;
    return validDate(yy > pivot ? 1900 + yy : 2000 + yy, +m[1], +m[2]);
  }
  return null;
}
function validDate(y: number, mo: number, d: number): string | null {
  if (y < 1900 || y > new Date().getFullYear() || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Split "City, ST 32801"-ish tails out of a single full-address string. */
function splitFullAddress(s: string): { address: string; city: string | null; state: string | null; zipcode: string | null } {
  const zipM = /(\d{5})(?:-\d{4})?\s*$/.exec(s);
  const zipcode = zipM ? zipM[1] : null;
  let rest = zipM ? s.slice(0, zipM.index).trim().replace(/,\s*$/, '') : s.trim();
  const stM = /,\s*([A-Za-z]{2})\.?$/.exec(rest);
  const state = stM ? stM[1].toUpperCase() : null;
  if (stM) rest = rest.slice(0, stM.index).trim();
  const parts = rest.split(',').map(p => p.trim()).filter(Boolean);
  const city = parts.length >= 2 ? parts[parts.length - 1] : null;
  const address = parts.length >= 2 ? parts.slice(0, -1).join(', ') : rest;
  return { address, city, state, zipcode };
}

type Verdict = 'ready' | 'duplicate_db' | 'duplicate_file' | 'no_contact' | 'no_name';

interface ImportRow {
  idx: number;                 // 1-based CSV data row number (for error report)
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  patient_notes: string | null;
  verdict: Verdict;
  detail: string;
}

const VERDICT_BADGE: Record<Verdict, { label: string; cls: string }> = {
  ready:          { label: 'Ready',            cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  duplicate_db:   { label: 'Already on file',  cls: 'bg-gray-100 text-gray-600 border-gray-300' },
  duplicate_file: { label: 'Duplicate in file', cls: 'bg-gray-100 text-gray-600 border-gray-300' },
  no_contact:     { label: 'No email/phone',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  no_name:        { label: 'Missing name',     cls: 'bg-red-50 text-red-700 border-red-200' },
};

const PatientCsvImportModal: React.FC<Props> = ({ open, onOpenChange, organizationId, onCreated }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, Field>>({});
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [includeNoContact, setIncludeNoContact] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ added: number; skipped: number; failed: Array<{ row: ImportRow; error: string }> } | null>(null);
  // Existing-patient keys for DB dedupe, loaded at parse time.
  const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set());
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set());
  const [loadingExisting, setLoadingExisting] = useState(false);

  const reset = () => {
    setFileName(null); setHeaders([]); setMapping({}); setRawRows([]);
    setResult(null); setProgress(0); setIncludeNoContact(false);
  };

  const handleFile = (f: File) => {
    reset();
    setFileName(f.name);
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: async (res) => {
        const hdrs = (res.meta.fields || []).filter(Boolean) as string[];
        if (hdrs.length === 0 || res.data.length === 0) {
          toast.error('Couldn\'t read any rows — is this a CSV with a header row?');
          return;
        }
        if (res.data.length > 2000) {
          toast.error('That\'s over 2,000 rows — split the file and import in parts.');
          return;
        }
        setHeaders(hdrs);
        const m: Record<string, Field> = {};
        for (const h of hdrs) m[h] = autoMapHeader(h);
        setMapping(m);
        setRawRows(res.data);

        // Load existing patient keys tenant-wide: the unique index on email is
        // (tenant_id, lower(email)) — an email under ANOTHER practice still
        // 23505s, so we must dedupe against everyone, not just this org.
        setLoadingExisting(true);
        try {
          const { data } = await supabase
            .from('tenant_patients')
            .select('email, phone')
            .is('deleted_at', null)
            .limit(10000);
          const em = new Set<string>(); const ph = new Set<string>();
          for (const r of (data || []) as any[]) {
            if (r.email) em.add(String(r.email).trim().toLowerCase());
            const p = normPhone(r.phone);
            if (p) ph.add(p);
          }
          setExistingEmails(em); setExistingPhones(ph);
        } catch { /* dedupe degrades to server unique-index errors */ }
        setLoadingExisting(false);
      },
      error: () => toast.error('Failed to parse the file — export it as CSV and try again.'),
    });
  };

  /** Fields currently mapped (for validation messaging). */
  const mappedFields = useMemo(() => new Set(Object.values(mapping)), [mapping]);
  const hasName = mappedFields.has('full_name') || (mappedFields.has('first_name') && mappedFields.has('last_name')) || mappedFields.has('first_name');

  /** Build normalized rows + verdicts from raw rows and current mapping. */
  const rows: ImportRow[] = useMemo(() => {
    if (rawRows.length === 0) return [];
    const seenEmail = new Set<string>();
    const seenPhone = new Set<string>();
    const out: ImportRow[] = [];

    const col = (field: Field) => headers.filter(h => mapping[h] === field);

    rawRows.forEach((r, i) => {
      const get = (field: Field) => col(field).map(h => String(r[h] ?? '').trim()).filter(Boolean).join(' ').trim();

      // Name
      let first = get('first_name');
      let last = get('last_name');
      const full = get('full_name');
      if ((!first || !last) && full) {
        // "Last, First" export style vs "First Last"
        if (full.includes(',')) {
          const [l, f] = full.split(',').map(s => s.trim());
          last = last || l; first = first || (f || '').split(/\s+/)[0] || '';
        } else {
          const toks = full.split(/\s+/);
          first = first || toks[0] || '';
          last = last || toks.slice(1).join(' ');
        }
      }
      // Single-token name → last name required by schema; use a dash rather
      // than dropping the patient (provider can fix inline later).
      if (first && !last) last = '—';

      const emailRaw = get('email').toLowerCase();
      const email = EMAIL_RE.test(emailRaw) ? emailRaw : null;
      const phone = normPhone(get('phone'));
      const dob = parseDob(get('dob'));

      let address = get('address') || null;
      let city = get('city') || null;
      let state = get('state') || null;
      let zipcode = get('zipcode') || null;
      const fullAddr = get('full_address');
      if (!address && fullAddr) {
        const s = splitFullAddress(fullAddr);
        address = s.address || null; city = city || s.city; state = state || s.state; zipcode = zipcode || s.zipcode;
      }

      let verdict: Verdict = 'ready';
      let detail = '';
      if (!first) { verdict = 'no_name'; detail = 'No name found on this row'; }
      else if (email && existingEmails.has(email)) { verdict = 'duplicate_db'; detail = 'Email already in the system'; }
      else if (!email && phone && existingPhones.has(phone)) { verdict = 'duplicate_db'; detail = 'Phone already in the system'; }
      else if (email && seenEmail.has(email)) { verdict = 'duplicate_file'; detail = 'Same email appears earlier in this file'; }
      else if (!email && phone && seenPhone.has(phone)) { verdict = 'duplicate_file'; detail = 'Same phone appears earlier in this file'; }
      else if (!email && !phone) { verdict = 'no_contact'; detail = 'No email or phone — can\'t contact or dedupe'; }

      if (email) seenEmail.add(email);
      if (phone) seenPhone.add(phone);

      out.push({
        idx: i + 2, // +2 = header row + 1-based
        first_name: first, last_name: last || '—',
        email, phone, date_of_birth: dob,
        address, city, state, zipcode,
        patient_notes: get('notes') || null,
        verdict, detail,
      });
    });
    return out;
  }, [rawRows, headers, mapping, existingEmails, existingPhones]);

  const counts = useMemo(() => {
    const c = { ready: 0, duplicate: 0, no_contact: 0, no_name: 0 };
    for (const r of rows) {
      if (r.verdict === 'ready') c.ready++;
      else if (r.verdict === 'duplicate_db' || r.verdict === 'duplicate_file') c.duplicate++;
      else if (r.verdict === 'no_contact') c.no_contact++;
      else c.no_name++;
    }
    return c;
  }, [rows]);

  const importable = useMemo(
    () => rows.filter(r => r.verdict === 'ready' || (includeNoContact && r.verdict === 'no_contact')),
    [rows, includeNoContact],
  );

  const doImport = async () => {
    if (importable.length === 0) { toast.error('Nothing to import'); return; }
    setImporting(true);
    setProgress(0);
    const failed: Array<{ row: ImportRow; error: string }> = [];
    let added = 0;

    const toPayload = (r: ImportRow) => ({
      tenant_id: DEFAULT_TENANT_ID,
      organization_id: organizationId,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      phone: r.phone,
      date_of_birth: r.date_of_birth,
      address: r.address,
      city: r.city,
      state: r.state,
      zipcode: r.zipcode,
      patient_notes: r.patient_notes,
      referred_by: 'csv_import',
      lab_reminder_cadence_days: 7,
      lab_reminder_deadline_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });

    const CHUNK = 25;
    for (let i = 0; i < importable.length; i += CHUNK) {
      const chunk = importable.slice(i, i + CHUNK);
      const { error: batchErr } = await supabase.from('tenant_patients').insert(chunk.map(toPayload) as any);
      if (!batchErr) {
        added += chunk.length;
      } else {
        // Batch failed (one bad row aborts the whole insert) — retry row-by-row
        // so 24 good patients aren't lost to 1 bad one.
        for (const r of chunk) {
          const { error } = await supabase.from('tenant_patients').insert(toPayload(r) as any);
          if (!error) { added += 1; continue; }
          const msg = String(error.message || '');
          if (/duplicate|unique/i.test(msg)) failed.push({ row: r, error: 'Already on file (server)' });
          else failed.push({ row: r, error: msg });
        }
      }
      setProgress(Math.round(((i + chunk.length) / importable.length) * 100));
    }

    const skipped = rows.length - importable.length;
    setResult({ added, skipped, failed });
    setImporting(false);
    if (added > 0) {
      toast.success(`Imported ${added} patient${added === 1 ? '' : 's'}`);
      onCreated?.();
    }
  };

  const downloadProblemRows = () => {
    const problem = [
      ...rows.filter(r => r.verdict === 'no_name' || (!includeNoContact && r.verdict === 'no_contact')),
      ...(result?.failed.map(f => f.row) || []),
    ];
    const csv = Papa.unparse(problem.map(r => ({
      row: r.idx, first_name: r.first_name, last_name: r.last_name,
      email: r.email || '', phone: r.phone || '', dob: r.date_of_birth || '',
      address: r.address || '', city: r.city || '', state: r.state || '', zip: r.zipcode || '',
      issue: result?.failed.find(f => f.row.idx === r.idx)?.error || r.detail,
    })));
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'patients-needing-attention.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const previewRows = rows.slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) { if (!v) reset(); onOpenChange(v); } }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[#B91C1C]" /> Import patients from CSV
          </DialogTitle>
        </DialogHeader>

        {/* ── STEP 1: pick a file ── */}
        {!fileName && (
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-[#B91C1C] hover:bg-red-50/30 transition"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          >
            <UploadCloud className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-800">Drop your patient list here, or click to browse</p>
            <p className="text-xs text-gray-500 mt-1">
              CSV export from your EHR/CRM · needs a header row · name required — DOB, phone, email, address all optional
            </p>
          </div>
        )}
        <input
          ref={fileRef} type="file" accept=".csv,text/csv,.txt" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); if (e.target) e.target.value = ''; }}
        />

        {/* ── STEP 2: mapping + preview ── */}
        {fileName && !result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700 font-medium truncate">{fileName} · {rawRows.length} rows</p>
              <Button variant="ghost" size="sm" className="text-xs" onClick={reset}>Choose a different file</Button>
            </div>

            {/* Column mapping */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Column mapping</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {headers.map(h => (
                  <div key={h} className="flex flex-col gap-1">
                    <span className="text-[11px] text-gray-500 truncate" title={h}>“{h}”</span>
                    <Select value={mapping[h]} onValueChange={(v) => setMapping(m => ({ ...m, [h]: v as Field }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FIELD_LABELS) as Field[]).map(f => (
                          <SelectItem key={f} value={f} className="text-xs">{FIELD_LABELS[f]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {!hasName && (
                <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-2">
                  Map at least a Name column (Full name, or First + Last) to continue.
                </p>
              )}
            </div>

            {/* Verdict summary */}
            {hasName && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className={VERDICT_BADGE.ready.cls}>✓ {counts.ready} ready</Badge>
                {counts.duplicate > 0 && <Badge variant="outline" className={VERDICT_BADGE.duplicate_db.cls}><SkipForward className="h-3 w-3 mr-1" />{counts.duplicate} already on file — will skip</Badge>}
                {counts.no_contact > 0 && <Badge variant="outline" className={VERDICT_BADGE.no_contact.cls}><AlertTriangle className="h-3 w-3 mr-1" />{counts.no_contact} missing email + phone</Badge>}
                {counts.no_name > 0 && <Badge variant="outline" className={VERDICT_BADGE.no_name.cls}>{counts.no_name} missing name — can't import</Badge>}
                {loadingExisting && <span className="text-gray-400 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> checking for existing patients…</span>}
              </div>
            )}

            {counts.no_contact > 0 && (
              <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <Checkbox checked={includeNoContact} onCheckedChange={(v) => setIncludeNoContact(!!v)} />
                Import the {counts.no_contact} patient{counts.no_contact === 1 ? '' : 's'} without email/phone anyway (they can't receive reminders until contact info is added)
              </label>
            )}

            {/* Preview table */}
            {hasName && rows.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Name</th>
                      <th className="text-left px-2 py-1.5 font-medium">Email</th>
                      <th className="text-left px-2 py-1.5 font-medium">Phone</th>
                      <th className="text-left px-2 py-1.5 font-medium">DOB</th>
                      <th className="text-left px-2 py-1.5 font-medium">Address</th>
                      <th className="text-left px-2 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map(r => (
                      <tr key={r.idx} className="border-t border-gray-100">
                        <td className="px-2 py-1.5 font-medium text-gray-900 whitespace-nowrap">{r.first_name} {r.last_name}</td>
                        <td className="px-2 py-1.5 text-gray-600">{r.email || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.phone || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{r.date_of_birth || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2 py-1.5 text-gray-600 max-w-[180px] truncate" title={[r.address, r.city, r.state, r.zipcode].filter(Boolean).join(', ')}>
                          {[r.address, r.city, r.state, r.zipcode].filter(Boolean).join(', ') || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`inline-block border rounded-full px-2 py-0.5 text-[10px] font-semibold ${VERDICT_BADGE[r.verdict].cls}`} title={r.detail}>
                            {VERDICT_BADGE[r.verdict].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > previewRows.length && (
                  <p className="text-[11px] text-gray-400 px-2 py-1.5 border-t border-gray-100">…and {rows.length - previewRows.length} more rows</p>
                )}
              </div>
            )}

            {importing && (
              <div className="space-y-1">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#B91C1C] transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-[11px] text-gray-500">Importing… {progress}%</p>
              </div>
            )}

            <DialogFooter className="gap-2">
              {(counts.no_name > 0 || (counts.no_contact > 0 && !includeNoContact)) && (
                <Button variant="outline" size="sm" onClick={downloadProblemRows} className="text-xs gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Download rows needing attention
                </Button>
              )}
              <Button
                onClick={doImport}
                disabled={importing || !hasName || importable.length === 0 || loadingExisting}
                className="bg-[#B91C1C] hover:bg-[#991B1B] text-white"
              >
                {importing
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Importing…</>
                  : `Import ${importable.length} patient${importable.length === 1 ? '' : 's'}`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── STEP 3: receipt ── */}
        {result && (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> {result.added} patient{result.added === 1 ? '' : 's'} imported
              </p>
              <p className="text-xs text-emerald-800 mt-1">
                {result.skipped > 0 ? `${result.skipped} skipped (already on file / excluded) · ` : ''}
                {result.failed.length > 0 ? `${result.failed.length} failed` : 'no failures'}
              </p>
            </div>
            {result.failed.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-amber-900">Rows that need attention:</p>
                {result.failed.slice(0, 5).map((f, i) => (
                  <p key={i} className="text-[11px] text-amber-800">Row {f.row.idx} · {f.row.first_name} {f.row.last_name} — {f.error}</p>
                ))}
                {result.failed.length > 5 && <p className="text-[11px] text-amber-700">…and {result.failed.length - 5} more</p>}
                <Button variant="outline" size="sm" onClick={downloadProblemRows} className="text-xs gap-1.5 mt-1">
                  <Download className="h-3.5 w-3.5" /> Download as CSV to fix + re-upload
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={reset} className="text-xs">Import another file</Button>
              <Button size="sm" onClick={() => { reset(); onOpenChange(false); }} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs">Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PatientCsvImportModal;
