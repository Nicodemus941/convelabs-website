import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, Trash2, ExternalLink, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { resizeImageForUpload } from '@/lib/imageResize';

// Wire up the pdfjs worker (needed for thumbnails)
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

/**
 * Hormozi-structured appointment lab-order panel.
 *
 * Three trust phases:
 *   1. STAGE   — drop/select files; show each one locally; dedup by SHA
 *   2. VERIFY  — upload to storage, row in appointment_lab_orders, OCR polls
 *                page count + panel chips appear as they resolve
 *   3. COMMIT  — implicit (row is already in DB). Persistent receipt card with
 *                page/panel/fasting summary replaces the transient toast.
 *
 * Supersedes the comma-separated lab_order_file_path hack on appointments.
 */

interface LabOrderRow {
  id: string;
  file_path: string;
  original_filename: string | null;
  file_size: number | null;
  page_count: number | null;
  ocr_status: 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
  ocr_detected_panels: any;
  ocr_fasting_required: boolean | null;
  ocr_error: string | null;
  uploaded_at: string;
}

interface Props {
  appointmentId: string;
  patientName?: string; // for wrong-patient name-mismatch warning
  canEdit?: boolean;
  onChanged?: () => void;
}

const MAX_FILE_SIZE_MB = 20;
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fire an owner SMS when a lab-order upload silently fails so ghost-uploads
 * (file picked → toast missed → file never landed) get caught in real time
 * instead of surfacing as "the phleb has no lab order" the day of the visit.
 * Non-blocking — never throws back into the upload caller.
 */
async function reportUploadFailure(opts: {
  appointmentId: string;
  patientName?: string;
  filename: string;
  stage: 'storage_upload' | 'db_insert' | 'exception' | 'oversize' | 'unsupported_type';
  detail: string;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const who = user?.email || user?.id?.slice(0, 8) || 'unknown';
    const apptShort = opts.appointmentId.slice(0, 8);
    const patient = opts.patientName ? ` · ${opts.patientName}` : '';
    const msg =
      `⚠️ Lab-order upload FAILED [${opts.stage}]${patient}` +
      ` · appt ${apptShort} · file ${opts.filename.slice(0, 60)}` +
      ` · by ${who} · ${opts.detail.slice(0, 200)}`;
    await supabase.functions.invoke('send-sms-notification', {
      body: { to: '9415279169', message: msg, category: 'admin_alert' },
    });
  } catch {
    /* swallow — telemetry must never block the upload UX */
  }
}

async function pdfPageCount(file: File): Promise<number | null> {
  if (file.type !== 'application/pdf') return 1;
  try {
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    return doc.numPages;
  } catch {
    return null;
  }
}

const AppointmentLabOrdersPanel: React.FC<Props> = ({ appointmentId, patientName, canEdit = true, onChanged }) => {
  const [rows, setRows] = useState<LabOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showReceipt, setShowReceipt] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('appointment_lab_orders')
      .select('*')
      .eq('appointment_id', appointmentId)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: true });
    setRows((data as any as LabOrderRow[]) || []);
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => { load(); }, [load]);

  // Poll while any row is still processing
  useEffect(() => {
    if (!rows.some(r => r.ocr_status === 'pending' || r.ocr_status === 'running')) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [rows, load]);

  const doUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    let uploadedCount = 0;
    let dupeCount = 0;
    let failedCount = 0;

    for (const rawFile of files) {
      // Guardrails (against ABSOLUTE size cap before downsize attempt)
      if (rawFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error(`${rawFile.name} exceeds ${MAX_FILE_SIZE_MB}MB`);
        reportUploadFailure({ appointmentId, patientName, filename: rawFile.name, stage: 'oversize', detail: `${(rawFile.size / 1024 / 1024).toFixed(1)}MB` });
        failedCount++; continue;
      }
      if (!ACCEPTED.includes(rawFile.type) && !/\.(pdf|jpe?g|png|webp|heic)$/i.test(rawFile.name)) {
        toast.error(`${rawFile.name} is not a supported file type`);
        reportUploadFailure({ appointmentId, patientName, filename: rawFile.name, stage: 'unsupported_type', detail: rawFile.type || 'unknown mime' });
        failedCount++; continue;
      }

      // Resize image for OCR — Anthropic Vision rejects images >5MB.
      // PDFs + small files pass through unchanged.
      const file = await resizeImageForUpload(rawFile);

      try {
        const sha = await sha256Hex(file);
        const pages = await pdfPageCount(file);
        const ext = file.name.split('.').pop() || 'bin';
        const path = `appointments/${appointmentId}/${Date.now()}-${sha.substring(0, 8)}.${ext}`;

        const { error: upErr } = await supabase.storage.from('lab-orders').upload(path, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
        if (upErr) {
          toast.error(`Upload failed for ${file.name}: ${upErr.message}`);
          reportUploadFailure({ appointmentId, patientName, filename: file.name, stage: 'storage_upload', detail: upErr.message || String(upErr) });
          failedCount++; continue;
        }

        // Set uploaded_by to current user id. Required by the
        // "Patients can upload" RLS policy and satisfies NOT NULL if set.
        // For admins, the "Admins can manage all lab orders" policy takes
        // precedence but uploaded_by should still be recorded for audit.
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const { data: inserted, error: insErr } = await supabase
          .from('appointment_lab_orders')
          .insert({
            appointment_id: appointmentId,
            file_path: path,
            original_filename: file.name,
            content_sha256: sha,
            file_size: file.size,
            mime_type: file.type || 'application/octet-stream',
            page_count: pages,
            ocr_status: 'pending',
            uploaded_by: currentUser?.id || null,
          })
          .select('id')
          .single();

        if (insErr) {
          // Unique-violation on (appointment_id, content_sha256) → duplicate
          if ((insErr as any).code === '23505') {
            toast.info(`${file.name} is already attached to this chart`);
            dupeCount++; continue;
          }
          // Surface the real error — was silently swallowed before, which
          // made "upload not accepting it" appear as a UI bug
          console.error('[lab-order insert] failed:', insErr);
          toast.error(`Failed to attach ${file.name}: ${insErr.message}`, { duration: 8000 });
          reportUploadFailure({ appointmentId, patientName, filename: file.name, stage: 'db_insert', detail: `${(insErr as any).code || ''} ${insErr.message || String(insErr)}` });
          failedCount++; continue;
        }

        // Fire OCR on just this row
        if (inserted?.id) {
          supabase.functions.invoke('ocr-lab-order', { body: { labOrderId: inserted.id } })
            .then(() => {}, () => {});
        }
        uploadedCount++;
      } catch (e: any) {
        toast.error(`${file.name} — ${e?.message || 'error'}`);
        reportUploadFailure({ appointmentId, patientName, filename: file.name, stage: 'exception', detail: e?.message || String(e) });
        failedCount++;
      }
    }

    setUploading(false);
    await load();
    onChanged?.();

    if (uploadedCount > 0) {
      toast.success(
        `${uploadedCount} file${uploadedCount === 1 ? '' : 's'} attached · OCR running${dupeCount > 0 ? ` (${dupeCount} duplicate skipped)` : ''}`
      );
      setShowReceipt(true);
    } else if (dupeCount > 0 && failedCount === 0) {
      toast.info(`${dupeCount} duplicate file${dupeCount === 1 ? '' : 's'} — nothing new attached`);
    }
  };

  const deleteRow = async (r: LabOrderRow) => {
    if (!confirm(`Remove "${r.original_filename || r.file_path}"?`)) return;
    const { error } = await supabase.from('appointment_lab_orders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', r.id);
    if (error) { toast.error('Failed to remove'); return; }
    toast.success('Removed');
    await load();
    onChanged?.();
  };

  const openSignedUrl = async (path: string) => {
    const { data } = await supabase.storage.from('lab-orders').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    else toast.error('Could not load file');
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // Aggregate summary across all complete rows
  const completeRows = rows.filter(r => r.ocr_status === 'complete');
  const totalPages = rows.reduce((s, r) => s + (r.page_count || 0), 0);
  const allPanels = Array.from(new Set(
    completeRows.flatMap(r => Array.isArray(r.ocr_detected_panels) ? r.ocr_detected_panels.map((p: any) => typeof p === 'string' ? p : p.name).filter(Boolean) : [])
  ));
  const anyFasting = completeRows.some(r => r.ocr_fasting_required);
  const runningCount = rows.filter(r => r.ocr_status === 'pending' || r.ocr_status === 'running').length;

  // Drag/drop handlers
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dropRef.current?.classList.remove('border-[#B91C1C]', 'bg-red-50');
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) doUpload(files);
  }, [appointmentId]);
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    dropRef.current?.classList.add('border-[#B91C1C]', 'bg-red-50');
  };
  const onDragLeave = () => {
    dropRef.current?.classList.remove('border-[#B91C1C]', 'bg-red-50');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">Lab Orders</p>
        {rows.length > 0 && (
          <p className="text-xs text-gray-500">
            {rows.length} file{rows.length === 1 ? '' : 's'}
            {totalPages > 0 ? ` · ${totalPages} page${totalPages === 1 ? '' : 's'}` : ''}
          </p>
        )}
      </div>

      {/* ── PHASE 3: Receipt card (aggregated summary) ──────────────────── */}
      {completeRows.length > 0 && showReceipt && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-900">
                {completeRows.length} order{completeRows.length === 1 ? '' : 's'} attached · {totalPages} page{totalPages === 1 ? '' : 's'} · {allPanels.length} test{allPanels.length === 1 ? '' : 's'} detected
              </p>
              {allPanels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {allPanels.slice(0, 15).map((p, i) => (
                    <span key={i} className="inline-block bg-white border border-emerald-300 text-emerald-800 text-[11px] font-medium px-2 py-0.5 rounded-full">{p}</span>
                  ))}
                  {allPanels.length > 15 && (
                    <span className="text-[11px] text-emerald-700">+{allPanels.length - 15}</span>
                  )}
                </div>
              )}
              {anyFasting && (
                <p className="text-[11px] text-amber-800 bg-amber-100 border border-amber-200 rounded px-2 py-1 mt-2 inline-block">
                  ⚠️ Fasting required — remind patient 24h before draw
                </p>
              )}
            </div>
            <button onClick={() => setShowReceipt(false)} className="text-emerald-700 hover:text-emerald-900 text-xs">Hide</button>
          </div>
        </div>
      )}

      {/* ── PHASE 2: Per-file rows with OCR status polling ──────────────── */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? null : (
        <div className="space-y-2">
          {rows.map(r => {
            const expanded = expandedIds.has(r.id);
            const panels: string[] = Array.isArray(r.ocr_detected_panels)
              ? r.ocr_detected_panels.map((p: any) => typeof p === 'string' ? p : p.name).filter(Boolean)
              : [];
            const displayName = r.original_filename || r.file_path.split('/').pop() || 'file';
            return (
              <div key={r.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <div className="flex items-center gap-2 p-2.5">
                  <FileText className="h-4 w-4 text-[#B91C1C] flex-shrink-0" />
                  <button
                    onClick={() => openSignedUrl(r.file_path)}
                    className="flex-1 min-w-0 text-left"
                    title="Open file"
                  >
                    <div className="text-sm font-medium text-gray-900 truncate">{displayName}</div>
                    <div className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                      {r.page_count && <span>{r.page_count} page{r.page_count === 1 ? '' : 's'}</span>}
                      {r.file_size && <span>· {(r.file_size / 1024).toFixed(0)} KB</span>}
                      {/* OCR status badge */}
                      {r.ocr_status === 'pending' && <span className="inline-flex items-center gap-0.5 text-blue-700"><Loader2 className="h-3 w-3 animate-spin" /> queued</span>}
                      {r.ocr_status === 'running' && <span className="inline-flex items-center gap-0.5 text-blue-700"><Sparkles className="h-3 w-3 animate-pulse" /> reading</span>}
                      {r.ocr_status === 'complete' && panels.length > 0 && <span className="text-emerald-700">· {panels.length} test{panels.length === 1 ? '' : 's'} detected</span>}
                      {r.ocr_status === 'complete' && panels.length === 0 && <span className="text-gray-500">· no tests detected</span>}
                      {r.ocr_status === 'failed' && <span className="text-red-600 inline-flex items-center gap-0.5"><AlertTriangle className="h-3 w-3" /> OCR failed</span>}
                      {r.ocr_fasting_required && <span className="text-amber-700">· fasting</span>}
                    </div>
                  </button>
                  <button onClick={() => openSignedUrl(r.file_path)} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded" title="Open file">
                    <ExternalLink className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Open</span>
                  </button>
                  {panels.length > 0 && (
                    <button onClick={() => toggleExpand(r.id)} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded" title={expanded ? 'Collapse' : 'Expand'}>
                      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">{expanded ? 'Hide' : 'Details'}</span>
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => deleteRow(r)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-red-600 hover:text-white hover:bg-red-600 rounded border border-red-200 hover:border-red-600 transition"
                      title="Delete this lab order"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  )}
                </div>

                {/* Expanded: thumbnail + full panel list */}
                {expanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-2">
                    {r.mime_type === 'application/pdf' && (
                      <PdfThumbnail filePath={r.file_path} pages={Math.min(r.page_count || 1, 4)} />
                    )}
                    {panels.length > 0 && (
                      <div>
                        <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-1">Detected tests</p>
                        <div className="flex flex-wrap gap-1">
                          {panels.map((p, i) => (
                            <span key={i} className="inline-block bg-white border border-emerald-300 text-emerald-800 text-[11px] font-medium px-2 py-0.5 rounded-full">{p}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {r.ocr_error && (
                      <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2">OCR error: {r.ocr_error}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {runningCount > 0 && (
            <p className="text-[11px] text-blue-700 flex items-center gap-1">
              <Sparkles className="h-3 w-3 animate-pulse" />
              Reading {runningCount} file{runningCount === 1 ? '' : 's'} — refreshing every 3s
            </p>
          )}
        </div>
      )}

      {/* ── PHASE 1: Drop / select files ────────────────────────────────── */}
      {canEdit && (
        <div
          ref={dropRef}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center transition-colors cursor-pointer hover:border-[#B91C1C] hover:bg-red-50/30"
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-blue-700">
              <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
            </div>
          ) : (
            <>
              <Upload className="h-5 w-5 mx-auto text-gray-400 mb-1.5" />
              <p className="text-sm font-medium text-gray-700">Drag & drop, or click to browse</p>
              <p className="text-[11px] text-gray-500 mt-0.5">PDF, JPG, PNG · max {MAX_FILE_SIZE_MB}MB each · OCR reads every page</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files || []);
              if (fs.length > 0) doUpload(fs);
              if (e.target) e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Small PDF thumbnail strip — shows up to N pages side-by-side.
 * Uses react-pdf's Document + Page with scale tuned for 80px tall.
 */
const PdfThumbnail: React.FC<{ filePath: string; pages: number }> = ({ filePath, pages }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.storage.from('lab-orders').createSignedUrl(filePath, 3600);
      setUrl(data?.signedUrl || null);
    })();
  }, [filePath]);
  if (!url) return <div className="h-20 bg-gray-100 rounded animate-pulse" />;
  return (
    <div className="flex gap-1.5 overflow-x-auto">
      <Document file={url} loading={<div className="h-20 w-16 bg-gray-100 rounded animate-pulse" />}>
        {Array.from({ length: pages }, (_, i) => (
          <div key={i} className="border border-gray-200 rounded overflow-hidden flex-shrink-0 bg-white">
            <Page pageNumber={i + 1} height={80} renderTextLayer={false} renderAnnotationLayer={false} />
          </div>
        ))}
      </Document>
    </div>
  );
};

export default AppointmentLabOrdersPanel;
