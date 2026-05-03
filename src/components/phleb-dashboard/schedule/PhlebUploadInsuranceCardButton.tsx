/**
 * PhlebUploadInsuranceCardButton
 *
 * Sibling of PhlebUploadLabOrderButton. Phleb captures the patient's
 * insurance card front (and optional back) from the field. Pipeline:
 *   1. Pick a file (camera / library / file picker)
 *   2. Resize for upload (Anthropic vision 5MB cap if we ever OCR it)
 *   3. Upload to insurance-cards storage bucket
 *   4. Stamp appointments.insurance_card_path so the appointment chart
 *      shows it immediately
 *   5. ALSO stamp tenant_patients.insurance_card_path so the patient's
 *      profile keeps the card on file for future visits — no re-asking
 *   6. Fire ocr-insurance-card edge fn (if available) to extract
 *      member ID / group / provider
 *
 * Hormozi: every visit is also a chance to fill the chart. The phleb
 * captures once; the patient never gets asked again.
 */

import React, { useRef, useState } from 'react';
import { resizeImageForUpload } from '@/lib/imageResize';
import { CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  appointmentId: string;
  patientId?: string | null;
  onUploaded?: (path: string) => void;
  variant?: 'primary' | 'subtle';
  label?: string;
}

const PhlebUploadInsuranceCardButton: React.FC<Props> = ({
  appointmentId, patientId, onUploaded, variant = 'subtle', label,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(rawFile: File) {
    if (busy) return;
    setBusy(true);
    try {
      const file = await resizeImageForUpload(rawFile);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const safeName = `phleb_ins_${appointmentId.substring(0, 8)}_${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('insurance-cards')
        .upload(safeName, file, {
          contentType: file.type || 'image/jpeg',
          upsert: false,
        });
      if (upErr) {
        toast.error(`Upload failed: ${upErr.message}`);
        return;
      }

      // 2. Stamp the appointment (immediate visibility on this visit)
      await supabase
        .from('appointments')
        .update({ insurance_card_path: safeName })
        .eq('id', appointmentId);

      // 3. Stamp the patient's profile too — so future visits inherit
      // the card automatically. Best-effort: if patient_id is missing
      // (rare), skip silently.
      if (patientId) {
        try {
          await supabase
            .from('tenant_patients')
            .update({ insurance_card_path: safeName, updated_at: new Date().toISOString() })
            .eq('id', patientId);
        } catch (e) { console.warn('[insurance-upload] patient profile stamp failed:', e); }
      }

      // 4. Fire OCR (non-blocking — captures member ID / group / provider).
      // We don't await; status surfaces via realtime to admin Inbox.
      try {
        supabase.functions.invoke('ocr-insurance-card', {
          body: { filePath: safeName, appointmentId, patientId: patientId || null },
        }).catch(() => {});
      } catch (e) { console.warn('[insurance-upload] OCR invoke skipped:', e); }

      toast.success('Insurance card saved to chart ✓');
      onUploaded?.(safeName);
    } catch (e: any) {
      toast.error(`Upload crashed: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={onChange}
      />
      <Button
        type="button"
        size="sm"
        variant={variant === 'primary' ? 'default' : 'outline'}
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
        className={`gap-1.5 text-xs h-8 ${
          variant === 'primary'
            ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white'
            : 'border-blue-300 text-blue-800 hover:bg-blue-50'
        } ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        {busy ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
        ) : (
          <><CreditCard className="h-3.5 w-3.5" /> {label || 'Upload Insurance Card'}</>
        )}
      </Button>
    </>
  );
};

export default PhlebUploadInsuranceCardButton;
