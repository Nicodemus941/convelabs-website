/**
 * OrgAttachLabOrderModal — drag-drop lab-order upload to an EXISTING
 * appointment, called from the provider dashboard's Upcoming list.
 *
 * Sprint 1 ship (2026-05-13). Closes the gap where orgs had nowhere to
 * upload an order if the patient already had an appointment booked
 * (manually by admin or by the patient online).
 *
 * Flow:
 *   1. Drag/drop or click to pick a single PDF / JPG / PNG (<=20MB)
 *   2. POST multipart to /functions/v1/attach-lab-order-to-appointment
 *   3. Edge fn checks org linkage → uploads → inserts row → fires OCR (~10–30s)
 *   4. Modal shows "21 panels detected ✓" + closes after 1.5s
 *
 * The edge function fires admin SMS + patient email server-side, so this
 * UI never sees those concerns. Hormozi: every promise on the dashboard
 * has a clear button; every button closes its own loop.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, UploadCloud, FileText, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';

interface AppointmentSummary {
  id: string;
  patient_name: string;
  appointment_date: string;
  appointment_time: string | null;
  service_name?: string | null;
  service_type?: string | null;
  has_existing_lab_order?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  appointment: AppointmentSummary | null;
  onUploaded?: () => void;
}

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.webp'];

type Phase = 'idle' | 'uploading' | 'success' | 'error';

interface OcrResult {
  status: string;
  panels_detected: number | null;
  panels: string[];
  fasting_required: boolean;
}

const OrgAttachLabOrderModal: React.FC<Props> = ({ open, onClose, appointment, onUploaded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPhase('idle');
    setErrMsg(null);
    setOcr(null);
    setReplaceExisting(false);
  };

  const handleClose = () => {
    if (phase === 'uploading') return; // don't allow close mid-upload
    reset();
    onClose();
  };

  const validate = (f: File): string | null => {
    const lower = f.name.toLowerCase();
    if (!ALLOWED_EXT.some(ext => lower.endsWith(ext))) {
      return `Unsupported file type. Accepted: ${ALLOWED_EXT.join(', ')}`;
    }
    if (f.size === 0) return 'File is empty.';
    if (f.size > MAX_BYTES) return 'File exceeds 20 MB.';
    return null;
  };

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    const err = validate(f);
    if (err) { setErrMsg(err); setPhase('error'); return; }
    setFile(f);
    setPhase('idle');
    setErrMsg(null);
  }, []);

  const handleUpload = async () => {
    if (!file || !appointment) return;
    setPhase('uploading');
    setErrMsg(null);
    try {
      const fd = new FormData();
      fd.append('appointment_id', appointment.id);
      fd.append('file', file);
      if (replaceExisting) fd.append('replace', 'true');

      // Invoke via supabase.functions so JWT is auto-attached.
      const { data, error } = await supabase.functions.invoke('attach-lab-order-to-appointment', {
        body: fd,
      });
      if (error) {
        // supabase-js wraps FunctionsHttpError — unwrap message
        let msg = error.message || 'Upload failed';
        try {
          const ctx: any = (error as any).context;
          if (ctx?.body) {
            const parsed = typeof ctx.body === 'string' ? JSON.parse(ctx.body) : ctx.body;
            msg = parsed?.message || parsed?.error || msg;
          }
        } catch { /* ignore parse */ }
        throw new Error(msg);
      }
      const payload = data as any;
      if (!payload?.ok) throw new Error(payload?.error || 'Upload failed');

      setOcr(payload.ocr || null);
      setPhase('success');
      toast.success('Lab order attached');

      // Auto-close + refresh after 2s so the org sees the OCR confirmation.
      setTimeout(() => {
        onUploaded?.();
        handleClose();
      }, 2200);
    } catch (e: any) {
      setErrMsg(e?.message || 'Upload failed');
      setPhase('error');
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (phase === 'uploading') return;
    handleFiles(e.dataTransfer.files);
  };

  if (!appointment) return null;

  const aptDate = appointment.appointment_date
    ? new Date(appointment.appointment_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'upcoming';
  const aptTime = appointment.appointment_time || '';
  const svc = appointment.service_name || appointment.service_type || 'Mobile Blood Draw';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-[#B91C1C]" />
            Upload lab order
          </DialogTitle>
          <DialogDescription>
            Attach the order to <strong>{appointment.patient_name}</strong>'s {aptDate}{aptTime ? ` ${aptTime}` : ''} visit — {svc}.
          </DialogDescription>
        </DialogHeader>

        {appointment.has_existing_lab_order && phase === 'idle' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>This appointment already has a lab order on file.</strong> By default, uploading another one <em>adds</em> to it (the existing order stays) — use this if your patient needs additional panels drawn.
              </div>
            </div>
            <label className="flex items-start gap-2 cursor-pointer pl-6">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-[#B91C1C]"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              <span>
                <strong>Replace the existing order instead.</strong> Check this if the order was wrong or has changed — the previous file is set aside and only this new one is used for the draw.
              </span>
            </label>
          </div>
        )}

        {/* Drop zone */}
        {phase !== 'success' && (
          <div
            onClick={() => phase !== 'uploading' && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-[#B91C1C] bg-red-50' :
              file ? 'border-emerald-300 bg-emerald-50' :
              phase === 'error' ? 'border-red-300 bg-red-50' :
              'border-gray-300 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={ALLOWED_EXT.join(',')}
              onChange={(e) => handleFiles(e.target.files)}
              disabled={phase === 'uploading'}
            />
            {file ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
                  <FileText className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-[11px] text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                {phase !== 'uploading' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-gray-500"
                    onClick={(e) => { e.stopPropagation(); reset(); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : (
              <div>
                <UploadCloud className="h-9 w-9 mx-auto text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-800">Drag &amp; drop or click to upload</p>
                <p className="text-[11px] text-gray-500 mt-1">PDF, JPG, PNG · up to 20 MB · OCR reads every page</p>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {phase === 'error' && errMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-sm text-red-900">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">{errMsg}</div>
          </div>
        )}

        {/* Success state with OCR readback */}
        {phase === 'success' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-900">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="font-semibold text-sm">Lab order attached</p>
            </div>
            {ocr?.status === 'complete' && ocr.panels_detected ? (
              <div>
                <div className="flex items-center gap-1.5 mb-2 text-xs">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
                  <span><strong>{ocr.panels_detected} test{ocr.panels_detected === 1 ? '' : 's'} detected</strong></span>
                  {ocr.fasting_required && <Badge variant="outline" className="text-[10px] bg-amber-50 border-amber-300 text-amber-900 ml-1">FASTING</Badge>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {ocr.panels.slice(0, 6).map((p, i) => (
                    <span key={i} className="text-[11px] bg-white border border-emerald-200 rounded-full px-2 py-0.5">{p}</span>
                  ))}
                  {ocr.panels.length > 6 && (
                    <span className="text-[11px] text-emerald-700">+{ocr.panels.length - 6} more</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs">OCR is processing — we'll auto-update the order in the next few minutes. Nothing else for you to do.</p>
            )}
            <p className="text-[11px] text-emerald-700 mt-3">
              ConveLabs admin notified · patient gets a courtesy email.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {phase !== 'success' && (
            <>
              <Button variant="outline" onClick={handleClose} disabled={phase === 'uploading'}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || phase === 'uploading'}
                className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5"
              >
                {phase === 'uploading' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading + reading…
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    Attach to visit
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrgAttachLabOrderModal;
