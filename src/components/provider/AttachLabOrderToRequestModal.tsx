import React, { useCallback, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, FileText, Loader2, UploadCloud, X } from 'lucide-react';

interface LabRequestSummary {
  id: string;
  patient_name: string;
  draw_by_date: string;
  has_lab_order?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  request: LabRequestSummary | null;
  onUploaded?: () => void;
}

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.webp'];

type Phase = 'idle' | 'uploading' | 'success' | 'error';

interface OcrResult {
  panels: Array<string | { name?: string | null }>;
  fastingRequired?: boolean;
  urineRequired?: boolean;
  gttRequired?: boolean;
}

const AttachLabOrderToRequestModal: React.FC<Props> = ({ open, onClose, request, onUploaded }) => {
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
    if (phase === 'uploading') return;
    reset();
    onClose();
  };

  const validate = (nextFile: File): string | null => {
    const lower = nextFile.name.toLowerCase();
    if (!ALLOWED_EXT.some(ext => lower.endsWith(ext))) {
      return `Unsupported file type. Accepted: ${ALLOWED_EXT.join(', ')}`;
    }
    if (nextFile.size === 0) return 'File is empty.';
    if (nextFile.size > MAX_BYTES) return 'File exceeds 20 MB.';
    return null;
  };

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const nextFile = files[0];
    const err = validate(nextFile);
    if (err) {
      setErrMsg(err);
      setPhase('error');
      return;
    }
    setFile(nextFile);
    setPhase('idle');
    setErrMsg(null);
  }, []);

  const handleUpload = async () => {
    if (!file || !request) return;
    setPhase('uploading');
    setErrMsg(null);
    try {
      const form = new FormData();
      form.append('request_id', request.id);
      form.append('file', file);
      if (replaceExisting) form.append('replace', 'true');

      const { data, error } = await supabase.functions.invoke('attach-lab-order-to-request', {
        body: form,
      });
      if (error) {
        let msg = error.message || 'Upload failed';
        try {
          const ctx: any = (error as any).context;
          if (ctx?.body) {
            const parsed = typeof ctx.body === 'string' ? JSON.parse(ctx.body) : ctx.body;
            msg = parsed?.message || parsed?.error || msg;
          }
        } catch {
          // ignore parse failures and keep the original error message
        }
        throw new Error(msg);
      }

      const payload = data as any;
      if (!payload?.ok) throw new Error(payload?.message || payload?.error || 'Upload failed');

      setOcr(payload.ocr || null);
      setPhase('success');
      toast.success(request.has_lab_order ? 'Lab order replaced' : 'Lab order attached');

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

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-[#B91C1C]" />
            {request.has_lab_order ? 'Replace lab order' : 'Attach lab order'}
          </DialogTitle>
          <DialogDescription>
            Update <strong>{request.patient_name}</strong>'s request before the {new Date(`${request.draw_by_date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} draw-by deadline.
          </DialogDescription>
        </DialogHeader>

        {request.has_lab_order && phase === 'idle' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>This request already has a lab order.</strong> Use replace only if the original order changed or was wrong.
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
                <strong>Replace the existing order.</strong> The request will use this new file instead.
              </span>
            </label>
          </div>
        )}

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
                <p className="text-sm font-medium text-gray-800">Drag & drop or click to upload</p>
                <p className="text-[11px] text-gray-500 mt-1">PDF, JPG, PNG · up to 20 MB · OCR re-checks the order</p>
              </div>
            )}
          </div>
        )}

        {phase === 'error' && errMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-sm text-red-900">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">{errMsg}</div>
          </div>
        )}

        {phase === 'success' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-900">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="font-semibold text-sm">Lab order updated</p>
            </div>
            <p className="text-xs text-emerald-800 mb-3">
              The request now has the new order on file. The dashboard will refresh with the OCR readback.
            </p>
            {!!ocr && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {(ocr.panels || []).slice(0, 10).map((panel, idx) => {
                    const name = typeof panel === 'string' ? panel : (panel?.name || '');
                    return (
                      <span key={`${name}-${idx}`} className="inline-block bg-white border border-emerald-300 text-emerald-800 text-[11px] font-medium px-2 py-0.5 rounded-full">
                        {name || 'Panel'}
                      </span>
                    );
                  })}
                </div>
                {(ocr.fastingRequired || ocr.urineRequired || ocr.gttRequired) && (
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {ocr.fastingRequired && <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded">Fasting required</span>}
                    {ocr.urineRequired && <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded">Urine specimen</span>}
                    {ocr.gttRequired && <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded">GTT</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={phase === 'uploading'}>
            {phase === 'success' ? 'Close' : 'Cancel'}
          </Button>
          {phase !== 'success' && (
            <Button
              onClick={handleUpload}
              disabled={!file || phase === 'uploading'}
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white"
            >
              {phase === 'uploading' ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Uploading…</> : (request.has_lab_order ? 'Replace order' : 'Attach order')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AttachLabOrderToRequestModal;
