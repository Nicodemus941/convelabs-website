import React, { useState, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChevronLeft, Upload, FileText, X, Phone, SkipForward, Shield, Loader2, CheckCircle, Sparkles } from 'lucide-react';
import { BookingFormValues } from '@/types/appointmentTypes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import LabDestinationSelector from './LabDestinationSelector';
import LabOrderPrepModal from './LabOrderPrepModal';
import ServiceAutoSwitchModal from './ServiceAutoSwitchModal';
import { analyzePrepRequirements, type PrepAnalysis } from '@/lib/phlebHelpers';
import { isPrepaidLabValue } from '@/lib/clientBillLabs';

interface LabOrderUploadStepProps {
  onNext: () => void;
  onBack: () => void;
  onFilesSelected: (files: File[]) => void;
  selectedFiles: File[];
  onInsuranceFileSelected?: (file: File | null) => void;
  selectedInsuranceFile?: File | null;
  onGoBackToSchedule?: () => void; // Layer 2: send user back to re-pick time after auto-switch
}

// Visit types that require lab order upload (cannot skip)
const REQUIRED_LAB_ORDER_TYPES = ['mobile', 'senior', 'therapeutic'];
// Visit types that require insurance upload
const REQUIRED_INSURANCE_TYPES = ['mobile', 'senior'];
// Visit types that need a lab destination
const REQUIRES_LAB_DESTINATION = ['mobile', 'senior', 'specialty-kit'];

const LabOrderUploadStep: React.FC<LabOrderUploadStepProps> = ({
  onNext,
  onBack,
  onFilesSelected,
  selectedFiles,
  onInsuranceFileSelected,
  selectedInsuranceFile,
  onGoBackToSchedule,
}) => {
  const { setValue, getValues, watch } = useFormContext<BookingFormValues>();
  const visitType = watch('serviceDetails.visitType') || '';
  const labDestination = watch('labOrder.labDestination');

  const isLabOrderRequired = REQUIRED_LAB_ORDER_TYPES.includes(visitType);
  const isInsuranceRequired = REQUIRED_INSURANCE_TYPES.includes(visitType);
  const needsLabDestination = REQUIRES_LAB_DESTINATION.includes(visitType);
  const isTherapeutic = visitType === 'therapeutic';
  const [hasInsuranceOnFile, setHasInsuranceOnFile] = useState(false);

  // ── Client-bill / prepaid detection ──────────────────────────────────
  // When the order is for a prepaid lab (Evexia / Access Medical Labs / Ulta
  // Lab Tests) OR the patient declares it's "Client Bill" OR the lab-order OCR
  // detects it, the lab won't bill the patient's insurance — so we drop the
  // insurance requirement entirely. Signals: selected destination + the
  // self-declared / OCR-set form flag.
  const clientBilledFlag = watch('labOrder.clientBilled');
  const isClientBilled = isPrepaidLabValue(labDestination) || !!clientBilledFlag;
  const effectiveInsuranceRequired = isInsuranceRequired && !isClientBilled;

  // Check if patient already has insurance card on file
  React.useEffect(() => {
    const email = getValues('patientDetails.email');
    if (email && effectiveInsuranceRequired) {
      supabase.from('tenant_patients').select('insurance_card_path, insurance_provider')
        .ilike('email', email).maybeSingle()
        .then(({ data }) => {
          if (data?.insurance_card_path || data?.insurance_provider) {
            setHasInsuranceOnFile(true);
          }
        });
    }
  }, []);

  const [mode, setMode] = useState<'upload' | 'fax' | 'skip'>(
    getValues('labOrder.skipped') ? 'skip' : 'upload'
  );
  const [faxNumber, setFaxNumber] = useState(getValues('labOrder.doctorFaxNumber') || '');

  // Lab order dropzone — supports multiple files. On drop we:
  //   1. Add file to local state for UI preview
  //   2. Upload to Supabase storage immediately (so we can OCR it)
  //   3. Fire ocr-lab-order edge fn on the first NEW file
  //   4. If fasting / urine / GTT detected → show the prep modal ("thanks, we read your order")
  //   5. Stash uploaded path + OCR result on form context so BookingFlow can reuse at checkout
  const onDropLabOrder = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    // Step 1: show files in UI right away (optimistic)
    onFilesSelected([...selectedFiles, ...acceptedFiles]);
    setValue('labOrder.hasFile', true);
    setValue('labOrder.skipped', false);

    // Step 2: upload to storage so OCR can read them + so checkout doesn't re-upload.
    // PRE-FIX (Valli & John Ritenour case, 2026-05-17): a failed upload only
    // logged console.warn and left the optimistic UI showing the file as
    // "added" — patient hit Continue, completed booking, but
    // lab_order_file_path stayed null on the appointment. Storage had zero
    // files for them. New behavior:
    //   - toast.error with the real reason on EVERY failed file
    //   - remove the failed file from selectedFiles so the UI matches reality
    //   - clear hasFile when nothing successfully uploaded
    const previouslyUploaded: string[] = (getValues('labOrder.uploadedPaths' as any) || []) as any;
    const newPaths: string[] = [];
    const failedFiles: File[] = [];
    for (const file of acceptedFiles) {
      const fileName = `laborder_${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('lab-orders').upload(fileName, file);
      if (!error) {
        newPaths.push(fileName);
      } else {
        failedFiles.push(file);
        console.error('[lab-order upload failed]', file.name, error);
        // Surface a real toast so the patient knows the file didn't land.
        // Use the storage error message when available so the cause is
        // actionable (size cap, RLS, network, etc.).
        const reason = (error as any)?.message || (error as any)?.error || 'unknown error';
        toast.error(`Couldn't upload ${file.name}: ${reason}. Please try again or email it to info@convelabs.com.`);
      }
    }
    // Reconcile optimistic UI with actual upload result: drop the failed
    // files from selectedFiles so the patient doesn't see them as "added".
    if (failedFiles.length > 0) {
      const failedNameSet = new Set(failedFiles.map(f => `${f.name}::${f.size}`));
      const survivingNew = acceptedFiles.filter(f => !failedNameSet.has(`${f.name}::${f.size}`));
      onFilesSelected([...selectedFiles, ...survivingNew]);
      // If every newly-dropped file failed AND there are no surviving files
      // overall, clear the hasFile flag so the booking flow knows the patient
      // hasn't actually uploaded anything. Prevents "lab order required" CTAs
      // from disappearing prematurely.
      if (survivingNew.length === 0 && selectedFiles.length === 0 && previouslyUploaded.length === 0) {
        setValue('labOrder.hasFile', false);
      }
    }
    if (newPaths.length === 0) return;

    const allPaths = [...previouslyUploaded, ...newPaths];
    setValue('labOrder.uploadedPaths' as any, allPaths);

    // Step 3 + 4: OCR the first newly-uploaded file
    setLabOrderOcrProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ocr-lab-order', {
        body: { filePath: newPaths[0] },
      });
      if (error) {
        console.warn('[ocr] edge fn error (non-blocking):', error);
        return;
      }
      if (!data?.ok) {
        console.warn('[ocr] returned not-ok:', data);
        return;
      }
      const panels: string[] = Array.isArray(data.panels) ? data.panels : [];
      const text: string = typeof data.textPreview === 'string' ? data.textPreview : '';
      const analysis = analyzePrepRequirements(panels, text);

      // Stash on form so the confirmation email / day-before SMS can use it too
      setValue('labOrder.ocrPanels' as any, panels);
      setValue('labOrder.ocrText' as any, text);

      // ── Client-bill / prepaid auto-detect ──────────────────────────
      // If the OCR read a prepaid lab (Evexia / Access Medical Labs / Ulta)
      // or a "Client Bill" designation, drop the insurance requirement live.
      if ((data as any).clientBilled === true) {
        setValue('labOrder.clientBilled', true);
        toast.success('Prepaid lab order detected — no insurance needed.');
      }

      // ── Layer 2: service-vs-OCR mismatch auto-switch ──────────────
      // `fastingDetected` is set by the OCR edge fn (true if any fasting
      // panel hit). The user already picked a service earlier in the flow;
      // if it conflicts with the OCR verdict, swap it + clear the slot +
      // prompt re-pick. This prevents the hard server-side reject in
      // create-appointment-checkout (Layer 3) from ever firing.
      const fastingDetected: boolean = Boolean((data as any).fastingDetected);
      const currentService = (getValues('serviceDetails.selectedService') || '') as string;
      let serviceSwitched = false;

      if (currentService === 'fasting-blood-draw' && fastingDetected === false) {
        // Fasting picked but order doesn't require fasting → switch to routine.
        // Clear ALL date/time/surcharge flags so the patient re-picks cleanly.
        // Prior bug: only cleared 'time' and 'date'; sameDay/weekend stayed
        // stamped from the previous selection, inflating the checkout price
        // by $75 (weekend) or $100 (same-day) — patient saw $225 on a $150
        // mobile draw and 'NaN-NaN-NaN' as the appointment date.
        setValue('serviceDetails.selectedService', 'routine-blood-draw');
        setValue('serviceDetails.duration', 60);
        setValue('serviceDetails.sameDay', false);
        setValue('serviceDetails.weekend', false);
        setValue('time', '');
        setValue('date', undefined as any);
        setAutoSwitchModal({
          open: true,
          fromService: 'fasting-blood-draw',
          toService: 'routine-blood-draw',
          fastingDetected: false,
          panels,
        });
        serviceSwitched = true;
      } else if (currentService === 'routine-blood-draw' && fastingDetected === true) {
        // Routine picked but order requires fasting → switch to fasting.
        // Same full clear as above so the patient re-picks cleanly.
        setValue('serviceDetails.selectedService', 'fasting-blood-draw');
        setValue('serviceDetails.duration', 60);
        setValue('serviceDetails.sameDay', false);
        setValue('serviceDetails.weekend', false);
        setValue('time', '');
        setValue('date', undefined as any);
        setAutoSwitchModal({
          open: true,
          fromService: 'routine-blood-draw',
          toService: 'fasting-blood-draw',
          fastingDetected: true,
          panels,
        });
        serviceSwitched = true;
      }

      // Fire the prep modal ONLY if there's actionable prep AND we didn't
      // just open the auto-switch modal (don't stack two modals on the user)
      if (!serviceSwitched) {
        if (analysis.hasAnyPrep) {
          setPrepAnalysis(analysis);
          setPrepModalOpen(true);
        } else {
          toast.success('Lab order uploaded — no special prep needed.');
        }
      }
    } catch (e) {
      console.warn('[ocr] client exception (non-blocking):', e);
    } finally {
      setLabOrderOcrProcessing(false);
    }
  }, [onFilesSelected, selectedFiles, setValue, getValues]);

  const { getRootProps: getLabOrderRootProps, getInputProps: getLabOrderInputProps, isDragActive: isLabOrderDragActive } = useDropzone({
    onDrop: onDropLabOrder,
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/heic': ['.heic'] },
    multiple: true,
    maxSize: 10 * 1024 * 1024,
  });

  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);

  // ── Lab order OCR state (fires on upload, drives the prep modal) ─────
  const [labOrderOcrProcessing, setLabOrderOcrProcessing] = useState(false);
  const [prepModalOpen, setPrepModalOpen] = useState(false);
  const [prepAnalysis, setPrepAnalysis] = useState<PrepAnalysis | null>(null);

  // ── Layer 2: service auto-switch on OCR / service mismatch ───────────
  const [autoSwitchModal, setAutoSwitchModal] = useState<{
    open: boolean;
    fromService: string;
    toService: string;
    fastingDetected: boolean;
    panels: string[];
  } | null>(null);

  // Insurance dropzone — upload to storage + auto OCR.
  //
  // CRITICAL FIX 2026-05-08 (Charles Cook case): this handler used to do
  // OCR on the in-memory file but NEVER uploaded the actual card to the
  // insurance-cards storage bucket. Result: every patient who "uploaded"
  // their insurance — the file was discarded the moment they left the
  // page. The insurance-cards bucket has been empty since launch; out of
  // 495+ patients only 1 had insurance_card_path on file.
  //
  // Mirror the lab-order upload pattern (line ~85 above): upload-on-drop,
  // save the path to form state, run OCR off the stored file.
  const onDropInsurance = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0 || !onInsuranceFileSelected) return;
    const file = acceptedFiles[0];
    onInsuranceFileSelected(file);
    setValue('labOrder.hasInsuranceFile', true);

    // Step 1: upload to insurance-cards storage so it's actually saved
    // and so the webhook + phleb dashboard can render it.
    let uploadedPath: string | null = null;
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const safeName = `booking_ins_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('insurance-cards')
        .upload(safeName, file, {
          contentType: file.type || 'image/jpeg',
          upsert: false,
        });
      if (upErr) {
        console.warn('[insurance-upload] storage upload failed (non-blocking):', upErr);
      } else {
        uploadedPath = safeName;
        // Persist the path on form state so BookingFlow's checkout payload
        // picks it up and forwards to the webhook → tenant_patients +
        // appointments.insurance_card_path. Without this setValue call,
        // the path is lost after this component unmounts.
        setValue('insurance.uploadedPath' as any, uploadedPath);
      }
    } catch (uploadErr) {
      console.warn('[insurance-upload] exception during upload (non-blocking):', uploadErr);
    }

    // Step 2: OCR. Images can OCR by path OR inline base64; PDFs OCR by
    // storage path only (extract-insurance-ocr reads PDFs from the bucket,
    // not from inline base64), so only attempt a PDF when the upload landed.
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (isImage || (isPdf && uploadedPath)) {
      setOcrProcessing(true);
      try {
        // Prefer OCR-by-storage-path if upload succeeded (avoids re-sending
        // the bytes); fall back to base64 if upload failed.
        let body: any;
        if (uploadedPath) {
          body = { filePath: uploadedPath };
        } else {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
          });
          body = { imageBase64: base64 };
        }

        const { data, error } = await supabase.functions.invoke('extract-insurance-ocr', { body });

        if (!error && data?.success && data?.data) {
          setOcrResult(data.data);
          const ocr = data.data as any;
          if (ocr.provider) setValue('insurance.provider' as any, ocr.provider);
          if (ocr.memberId) setValue('insurance.memberId' as any, ocr.memberId);
          if (ocr.groupNumber) setValue('insurance.groupNumber' as any, ocr.groupNumber);
          if (ocr.planType) setValue('insurance.planType' as any, ocr.planType);
          toast.success('Insurance info extracted from card!');
        }
      } catch (err) {
        console.error('OCR error:', err);
      } finally {
        setOcrProcessing(false);
      }
    }
  }, [onInsuranceFileSelected, setValue]);

  const { getRootProps: getInsuranceRootProps, getInputProps: getInsuranceInputProps, isDragActive: isInsuranceDragActive } = useDropzone({
    onDrop: onDropInsurance,
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/heic': ['.heic'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const handleRemoveFile = async (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    onFilesSelected(updated);
    if (updated.length === 0) setValue('labOrder.hasFile', false);

    // Also remove the matching uploaded path + storage object (best-effort)
    const paths: string[] = (getValues('labOrder.uploadedPaths' as any) || []) as any;
    if (paths[index]) {
      try {
        await supabase.storage.from('lab-orders').remove([paths[index]]);
      } catch (e) { console.warn('Storage remove failed (non-blocking):', e); }
      const nextPaths = paths.filter((_, i) => i !== index);
      setValue('labOrder.uploadedPaths' as any, nextPaths);
      if (nextPaths.length === 0) {
        setValue('labOrder.ocrPanels' as any, []);
        setValue('labOrder.ocrText' as any, '');
      }
    }
  };

  const handleRemoveInsurance = async () => {
    if (onInsuranceFileSelected) onInsuranceFileSelected(null);
    setValue('labOrder.hasInsuranceFile', false);
    // Clear the OCR'd fields + storage path so they don't propagate to the
    // checkout payload. Best-effort: also delete the storage object so we
    // don't leak orphaned uploads.
    setOcrResult(null);
    setValue('insurance.provider' as any, undefined);
    setValue('insurance.memberId' as any, undefined);
    setValue('insurance.groupNumber' as any, undefined);
    setValue('insurance.planType' as any, undefined);
    const path: string | null = (getValues('insurance.uploadedPath' as any) as any) || null;
    if (path) {
      try {
        await supabase.storage.from('insurance-cards').remove([path]);
      } catch (e) { console.warn('[insurance-upload] storage remove failed (non-blocking):', e); }
      setValue('insurance.uploadedPath' as any, undefined);
    }
  };

  const handleFaxMode = () => {
    setMode('fax');
    onFilesSelected([]);
    setValue('labOrder.hasFile', false);
    setValue('labOrder.skipped', false);
  };

  const handleSkip = () => {
    setMode('skip');
    onFilesSelected([]);
    setValue('labOrder.skipped', true);
    setValue('labOrder.hasFile', false);
    setValue('labOrder.doctorFaxNumber', '');
  };

  const handleNext = () => {
    if (mode === 'fax') {
      setValue('labOrder.doctorFaxNumber', faxNumber);
    }
    onNext();
  };

  const hasLabOrder = selectedFiles.length > 0 || (mode === 'fax' && faxNumber.length >= 10) || mode === 'skip';
  const hasInsurance = !effectiveInsuranceRequired || selectedInsuranceFile !== null || hasInsuranceOnFile;
  const hasLabDest = !needsLabDestination || (labDestination && labDestination.length > 0);
  const canProceed = hasLabOrder && hasInsurance && hasLabDest;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isTherapeutic ? "Doctor's Order & Details" : 'Lab Order & Documents'}
        </CardTitle>
        <CardDescription>
          {isTherapeutic
            ? "Upload your doctor's order specifying the volume of blood to be removed."
            : isLabOrderRequired
            ? 'Please upload your lab order and required documents.'
            : 'Upload your lab order, or we can get it from your doctor.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Lab Order Upload */}
        <div className="space-y-3">
          <label className="text-sm font-medium">
            {isTherapeutic ? "Doctor's Order" : 'Lab Order'}
            {isLabOrderRequired && <span className="text-red-500 ml-1">*</span>}
          </label>

          {mode === 'upload' && (
            <div
              {...getLabOrderRootProps()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                isLabOrderDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <input {...getLabOrderInputProps()} />
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="font-medium text-sm">
                {isLabOrderDragActive ? 'Drop here' : 'Drag & drop or click to upload'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, HEIC (max 10MB)</p>
            </div>
          )}

          {labOrderOcrProcessing && (
            <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              <span>Reading your lab order to give you personalized prep instructions…</span>
            </div>
          )}

          {mode === 'upload' && selectedFiles.length > 0 && (
            <div className="space-y-2">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
                  <FileText className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveFile(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">You can add more files by dropping or clicking above.</p>
            </div>
          )}

          {mode === 'skip' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
              <p className="text-xs text-amber-800 font-medium">No lab order provided.</p>
              <p className="text-xs text-amber-600 mt-1">It is the patient's responsibility to provide a valid lab order from their healthcare provider. Without it, we may be unable to perform the collection.</p>
            </div>
          )}

          {/* Mode toggles */}
          <div className="flex flex-wrap gap-2 text-xs">
            {mode !== 'upload' && (
              <Button variant="link" size="sm" className="px-0 h-auto text-xs" onClick={() => setMode('upload')}>Upload a lab order</Button>
            )}
            {!isLabOrderRequired && mode !== 'skip' && (
              <Button variant="link" size="sm" className="px-0 h-auto text-xs" onClick={handleSkip}>Skip for now</Button>
            )}
          </div>

          {/* "Don't have it yet?" — instead of letting patients bounce at this
              step, surface the "have your doctor fax it" path prominently with
              a clear explanation of WHY lab order is required up-front. */}
          {!hasLabOrder && mode !== 'fax' && (
            <div className="mt-4 p-3 rounded-lg border border-blue-200 bg-blue-50">
              <p className="text-sm font-semibold text-blue-900">📠 Don't have your lab order in hand?</p>
              <p className="text-xs text-blue-700 mt-0.5 mb-2">
                We require the order before drawing so we collect the right tubes and tests.
                The fastest path: ask your doctor's office to <strong>fax it to (941) 251-8467</strong> —
                or pick this option and we'll contact your doctor's office directly to request it.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs border-blue-300 text-blue-800 hover:bg-blue-100"
                onClick={handleFaxMode}
              >
                📠 Have my doctor fax it instead
              </Button>
            </div>
          )}
        </div>

        {/* Client-bill / prepaid self-declaration — lets the patient tell us
            the order is already paid for so we don't ask for insurance.
            Shown only for visit types that would otherwise require insurance,
            and only when a prepaid lab isn't already selected (which implies
            it on its own). */}
        {isInsuranceRequired && !isPrepaidLabValue(labDestination) && (
          <div className="border-t pt-5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                checked={!!clientBilledFlag}
                onChange={(e) => setValue('labOrder.clientBilled', e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium">My lab order is prepaid / says "Client Bill"</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Check this if your order is for Evexia, Access Medical Labs, or Ulta Lab Tests, or is marked "Client Bill." These are already paid for — no insurance needed.
                </span>
              </span>
            </label>
          </div>
        )}

        {/* Insurance not needed — prepaid / client-bill order */}
        {isInsuranceRequired && isClientBilled && (
          <div className="border-t pt-5">
            <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-green-50 border border-green-200 text-green-800">
              <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>No insurance needed.</strong> This lab order is prepaid (Client Bill), so the lab won't bill your insurance — you can skip that step.
              </span>
            </div>
          </div>
        )}

        {/* Insurance Upload (for Mobile & Senior, unless prepaid/client-bill) */}
        {effectiveInsuranceRequired && (
          <div className="space-y-3 border-t pt-5">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <label className="text-sm font-medium">
                Insurance Card {!hasInsuranceOnFile && <span className="text-red-500">*</span>}
              </label>
              {hasInsuranceOnFile && (
                <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">On file</span>
              )}
            </div>
            {hasInsuranceOnFile ? (
              <p className="text-xs text-green-600">
                Your insurance is already on file from a previous visit. You can upload a new card to update it, or skip this step.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Upload a photo of your insurance card (front and back recommended).
              </p>
            )}

            {!selectedInsuranceFile ? (
              <div
                {...getInsuranceRootProps()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                  isInsuranceDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
              >
                <input {...getInsuranceInputProps()} />
                <Shield className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                <p className="text-sm font-medium">Upload insurance card</p>
                <p className="text-xs text-muted-foreground">PDF, JPG, PNG</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
                <Shield className="h-6 w-6 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{selectedInsuranceFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(selectedInsuranceFile.size / 1024).toFixed(0)} KB</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRemoveInsurance}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* OCR Processing / Results */}
            {ocrProcessing && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <p className="text-xs text-blue-700">Reading insurance card...</p>
              </div>
            )}
            {ocrResult && !ocrProcessing && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <p className="text-xs font-medium text-green-800">Insurance Info Extracted</p>
                </div>
                {ocrResult.provider && <p className="text-xs"><span className="text-muted-foreground">Provider:</span> <strong>{ocrResult.provider}</strong></p>}
                {ocrResult.memberId && <p className="text-xs"><span className="text-muted-foreground">Member ID:</span> <strong>{ocrResult.memberId}</strong></p>}
                {ocrResult.groupNumber && <p className="text-xs"><span className="text-muted-foreground">Group:</span> <strong>{ocrResult.groupNumber}</strong></p>}
                {ocrResult.planType && <p className="text-xs"><span className="text-muted-foreground">Plan:</span> {ocrResult.planType}</p>}
                <p className="text-[10px] text-muted-foreground mt-2">This info will be saved to your profile after booking.</p>
              </div>
            )}
          </div>
        )}

        {/* Lab Destination Selector */}
        {needsLabDestination && (
          <div className="border-t pt-5">
            <LabDestinationSelector visitType={visitType} />
          </div>
        )}

        {/* Validation messages — show what's still needed */}
        {!canProceed && (selectedFiles.length > 0 || mode === 'skip') && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
            {!hasInsurance && isInsuranceRequired && (
              <p className="text-xs text-amber-700 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Please upload your insurance card to continue
              </p>
            )}
            {!hasLabDest && needsLabDestination && (
              <p className="text-xs text-amber-700 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Please select a lab destination below
              </p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button type="button" variant="outline" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button
            type="button"
            onClick={handleNext}
            disabled={!canProceed}
            className="bg-conve-red hover:bg-conve-red-dark text-white rounded-xl"
          >
            Continue
          </Button>
        </div>
      </CardContent>

      {/* "Thanks, we read your lab order" modal — fires on upload when prep needed */}
      <LabOrderPrepModal
        open={prepModalOpen}
        onClose={() => setPrepModalOpen(false)}
        analysis={prepAnalysis}
        patientFirstName={getValues('patientDetails.firstName')}
      />

      {/* Layer 2 — service-vs-OCR auto-switch (e.g., fasting requested but
          order shows no fasting panel → swap to Routine, force re-pick slot) */}
      {autoSwitchModal && (
        <ServiceAutoSwitchModal
          open={autoSwitchModal.open}
          onClose={() => setAutoSwitchModal(null)}
          onGoBackToSchedule={() => {
            setAutoSwitchModal(null);
            if (onGoBackToSchedule) onGoBackToSchedule();
          }}
          fromService={autoSwitchModal.fromService}
          toService={autoSwitchModal.toService}
          fastingDetected={autoSwitchModal.fastingDetected}
          panels={autoSwitchModal.panels}
          patientFirstName={getValues('patientDetails.firstName')}
        />
      )}
    </Card>
  );
};

export default LabOrderUploadStep;
