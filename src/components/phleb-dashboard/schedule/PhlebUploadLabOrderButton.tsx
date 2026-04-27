/**
 * PhlebUploadLabOrderButton
 *
 * Lets the phlebotomist capture/upload a lab order to a specific appointment
 * from the field. The pipeline:
 *   1. Pick a file (camera or library on mobile, file picker on desktop)
 *   2. Upload to the lab-orders storage bucket
 *   3. Insert a new appointment_lab_orders row (status = 'pending')
 *   4. Invoke ocr-lab-order with the labOrderId
 *      → server runs OCR + extracts provider block
 *      → server calls discover_or_link_provider_org
 *      → either matches existing org by name+zip / npi OR creates a new
 *        'discovered_from_ocr' org (inactive, flagged for admin review)
 *   5. Toast back to the phleb with the matched org or "new lead created"
 *
 * Hormozi: every patient visit IS a partnership lead. The phleb in the field
 * becomes the org-discovery engine — no extra paperwork.
 */

import React, { useRef, useState } from 'react';
import { FileUp, Loader2, CheckCircle2, AlertCircle, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  appointmentId: string;
  onUploaded?: () => void; // refresh appointment data afterward
  variant?: 'primary' | 'subtle';
  label?: string;
}

const PhlebUploadLabOrderButton: React.FC<Props> = ({ appointmentId, onUploaded, variant = 'primary', label }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    if (busy) return;
    setBusy(true);
    const startedAt = Date.now();
    try {
      // 1. Upload the file to storage
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const safeName = `phleb_${appointmentId.substring(0, 8)}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('lab-orders')
        .upload(safeName, file, {
          contentType: file.type || 'application/pdf',
          upsert: false,
        });
      if (upErr) {
        toast.error(`Upload failed: ${upErr.message}`);
        return;
      }

      // 2. Get the current user (phleb) for the audit trail
      const { data: { user } } = await supabase.auth.getUser();

      // 3. Insert the appointment_lab_orders row
      const { data: row, error: rowErr } = await supabase
        .from('appointment_lab_orders' as any)
        .insert({
          appointment_id: appointmentId,
          file_path: safeName,
          original_filename: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          uploaded_by: user?.id || null,
          ocr_status: 'pending',
        })
        .select('id')
        .single();
      if (rowErr || !row) {
        toast.error(`Couldn't link upload: ${rowErr?.message || 'unknown'}`);
        return;
      }

      const labOrderId = (row as any).id;

      // 4. Show progress toast — OCR can take 5-15s on Claude Vision
      toast.loading('Reading lab order — matching to provider…', { id: 'ocr-' + labOrderId, duration: 30000 });

      // 5. Trigger OCR + org-match (chained server-side)
      const { data: ocrResp, error: ocrErr } = await supabase.functions.invoke('ocr-lab-order', {
        body: { labOrderId },
      });

      toast.dismiss('ocr-' + labOrderId);

      if (ocrErr) {
        toast.error(`OCR failed: ${ocrErr.message}. File is uploaded — admin will review.`);
        onUploaded?.();
        return;
      }

      // 6. Pull the row back to read the org-match outcome
      const { data: orgMatch } = await supabase
        .from('appointment_lab_orders' as any)
        .select('org_match_status, org_match_reason, org_match_organization_id')
        .eq('id', labOrderId)
        .maybeSingle();

      // 7. Tailored success messaging
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const action = (orgMatch as any)?.org_match_status;
      if (action === 'matched') {
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', (orgMatch as any).org_match_organization_id)
          .maybeSingle();
        toast.success(`Matched to ${org?.name || 'existing partner'} (${(orgMatch as any).org_match_reason}) · ${elapsed}s`, { duration: 6000 });
      } else if (action === 'auto_created') {
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', (orgMatch as any).org_match_organization_id)
          .maybeSingle();
        toast.success(`New lead created: ${org?.name || 'practice'} · queued for Nico's review · ${elapsed}s`, { duration: 8000 });
      } else {
        toast.success(`Lab order uploaded · OCR'd in ${elapsed}s. Couldn't auto-match a provider — admin will review.`, { duration: 7000 });
      }
      onUploaded?.();
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
        capture="environment"
        className="hidden"
        onChange={onChange}
      />
      <Button
        type="button"
        size="sm"
        variant={variant === 'primary' ? 'default' : 'outline'}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          fileRef.current?.click();
        }}
        className={`gap-1.5 text-xs h-8 ${
          variant === 'primary'
            ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white'
            : 'border-amber-300 text-amber-800 hover:bg-amber-50'
        } ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading…
          </>
        ) : (
          <>
            <FileUp className="h-3.5 w-3.5" />
            {label || 'Upload Lab Order'}
          </>
        )}
      </Button>
    </>
  );
};

export default PhlebUploadLabOrderButton;
