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
  /**
   * Fired AFTER the OCR call resolves (carrier/member-ID extracted). The card
   * uses this to re-fetch patient_insurances a second time — the post-upload
   * fetch runs before OCR finishes, so without this the extracted text only
   * appears on a manual refresh (the "Lyla Levitt card not showing" report).
   */
  onExtracted?: () => void;
  variant?: 'primary' | 'subtle';
  label?: string;
  rank?: 'primary' | 'secondary';
  /**
   * Which side of the card. 'front' (default) writes to card_front_path
   * + drives the legacy mirror. 'back' writes to card_back_path only —
   * holds the member-services phone that insurers require for claim
   * verification. Hormozi: claims that can't be verified by phone get
   * rejected at ~$50-150 each in re-billing cost; capturing the back
   * eliminates that whole class of rejection.
   */
  side?: 'front' | 'back';
}

const PhlebUploadInsuranceCardButton: React.FC<Props> = ({
  appointmentId, patientId, onUploaded, onExtracted, variant = 'subtle', label, rank = 'primary', side = 'front',
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(rawFile: File) {
    if (busy) return;
    setBusy(true);
    try {
      const file = await resizeImageForUpload(rawFile);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const safeName = `phleb_ins_${side}_${appointmentId.substring(0, 8)}_${Date.now()}.${ext}`;

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

      // 2. Primary FRONT only: stamp legacy fields on appointment +
      // tenant_patients so existing surfaces keep working. Back side
      // skips legacy entirely (those columns only hold a front image).
      // Defense-in-depth (Charles Cook 2026-05-08): use .select() so a
      // silent RLS no-op surfaces visibly.
      if (rank === 'primary' && side === 'front') {
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
      // Front uploads upsert (deactivate old + insert new active row).
      // Back uploads UPDATE the existing active row's card_back_path
      // instead of creating a new row — back is metadata on the existing
      // primary, not a new insurance record.
      if (patientId) {
        try {
          if (side === 'back') {
            // Find active row at this rank and update its back path
            const { data: existing } = await supabase
              .from('patient_insurances' as any)
              .select('id')
              .eq('patient_id', patientId)
              .eq('rank', rank)
              .eq('is_active', true)
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (existing) {
              const { data: updRow, error: updErr } = await supabase
                .from('patient_insurances' as any)
                .update({ card_back_path: safeName })
                .eq('id', (existing as any).id)
                .select('id');
              if (updErr || !updRow || updRow.length === 0) {
                console.warn('[insurance-upload] back-side update failed:', updErr);
                toast.error('Back-side save failed — please retry');
              }
            } else {
              // No front-side row yet — create one with only the back path so
              // the back doesn't get orphaned. Phleb / admin can upload the
              // front later; the OCR + mirror trigger handle propagation.
              await supabase.from('patient_insurances' as any).insert({
                patient_id: patientId,
                rank,
                card_back_path: safeName,
                is_active: true,
              });
            }
          } else {
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
      const rankLabel = rank === 'secondary' ? 'Secondary' : 'Primary';
      const sideLabel = side === 'back' ? 'back' : 'front';
      toast.success(`${rankLabel} insurance ${sideLabel} saved ✓`);
      onUploaded?.(safeName);

      // Fire OCR and SURFACE the outcome — previously this was fire-and-forget
      // with .catch(()=>{}), so a 500 (the base64 stack-overflow bug) left the
      // carrier/member-ID silently unextracted while the phleb saw "saved ✓".
      // Now: on the FRONT, if OCR can't read the carrier, tell the phleb so
      // they can enter it manually instead of assuming the chart is complete.
      try {
        const { data: ocr, error: ocrErr } = await supabase.functions.invoke('extract-insurance-ocr', {
          body: { filePath: safeName, appointmentId, patientId: patientId || null, rank, side },
        });
        if (side === 'front') {
          const provider = (ocr as any)?.data?.provider;
          if (ocrErr || !(ocr as any)?.success || !provider) {
            toast.warning("Card image saved, but we couldn't auto-read the carrier — please enter the insurance details manually.");
          } else {
            toast.success(`Read ${provider}${(ocr as any)?.data?.memberId ? ` · ${(ocr as any).data.memberId}` : ''} ✓`);
          }
        }
      } catch (e) {
        console.warn('[insurance-upload] OCR invoke failed:', e);
        if (side === 'front') toast.warning("Card image saved, but the reader didn't respond — enter the insurance details manually if needed.");
      } finally {
        // OCR done (success OR fail) — tell the card to re-fetch so the now-
        // extracted carrier/member ID appears without a manual refresh.
        onExtracted?.();
      }
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
