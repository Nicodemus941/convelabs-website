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
  /**
   * Insurance rank — 'primary' (default) or 'secondary'. The patient's
   * primary always goes on appointments.insurance_card_path AND
   * tenant_patients.insurance_card_path for legacy compatibility.
   * Secondary only writes to the new patient_insurances table.
   * 2026-05-07 multi-insurance feature.
   */
  rank?: 'primary' | 'secondary';
}

const PhlebUploadInsuranceCardButton: React.FC<Props> = ({
  appointmentId, patientId, onUploaded, variant = 'subtle', label, rank = 'primary',
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

      // 2. Primary card: stamp legacy fields on appointment + tenant_patients
      // so existing surfaces keep working. Secondary skips the legacy stamps
      // (those columns only hold one insurance).
      // Defense-in-depth (Charles Cook 2026-05-08): use .select() so a
      // silent RLS no-op surfaces visibly. Without this, the Charles
      // upload silently failed to mirror to legacy columns and the
      // chart-old surfaces stayed empty until I manually backfilled.
      if (rank === 'primary') {
        const { data: apptRows, error: apptErr } = await supabase
          .from('appointments')
          .update({ insurance_card_path: safeName })
          .eq('id', appointmentId)
          .select('id');
        if (apptErr) console.warn('[insurance-upload] appointment legacy stamp failed:', apptErr);
        else if (!apptRows || apptRows.length === 0) {
          console.warn('[insurance-upload] appointment legacy stamp affected 0 rows (RLS?)');
        }
        if (patientId) {
          const { data: tpRows, error: tpErr } = await supabase
            .from('tenant_patients')
            .update({ insurance_card_path: safeName, updated_at: new Date().toISOString() })
            .eq('id', patientId)
            .select('id');
          if (tpErr) console.warn('[insurance-upload] tenant_patients legacy stamp failed:', tpErr);
          else if (!tpRows || tpRows.length === 0) {
            console.warn('[insurance-upload] tenant_patients legacy stamp affected 0 rows (RLS?)');
          }
        }
      }

      // 3. NEW source of truth — patient_insurances row (one per rank).
      // Upsert via deactivate-old + insert-new so existing primary becomes
      // historical and the fresh upload becomes the active row. The trigger
      // mirror_patient_insurances_to_legacy auto-mirrors fields back to
      // tenant_patients legacy columns on every insert/update.
      if (patientId) {
        try {
          await supabase
            .from('patient_insurances' as any)
            .update({ is_active: false })
            .eq('patient_id', patientId)
            .eq('rank', rank)
            .eq('is_active', true);
          const { data: insRow, error: insErr } = await supabase
            .from('patient_insurances' as any)
            .insert({
              patient_id: patientId,
              rank,
              card_front_path: safeName,
              is_active: true,
            })
            .select('id');
          if (insErr) {
            console.warn('[insurance-upload] patient_insurances insert failed:', insErr);
            toast.error('Card image saved but row write failed — admin may need to verify chart');
          } else if (!insRow || insRow.length === 0) {
            console.warn('[insurance-upload] patient_insurances insert affected 0 rows (RLS?)');
          }
        } catch (e) { console.warn('[insurance-upload] patient_insurances write exception:', e); }
      }

      // 4. Fire OCR — calls extract-insurance-ocr which writes parsed
      // fields directly into patient_insurances at the matching rank
      // (and into tenant_patients legacy fields if rank=primary).
      // Non-blocking so the phleb sees "saved" immediately even if OCR
      // is slow. Prior bug: this called a non-existent fn name
      // ('ocr-insurance-card') and silently swallowed the 404, which
      // meant insurance text fields were never auto-populated.
      try {
        supabase.functions.invoke('extract-insurance-ocr', {
          body: { filePath: safeName, appointmentId, patientId: patientId || null, rank },
        }).catch(() => {});
      } catch (e) { console.warn('[insurance-upload] OCR invoke skipped:', e); }

      toast.success(`${rank === 'secondary' ? 'Secondary' : 'Primary'} insurance saved ✓`);
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
