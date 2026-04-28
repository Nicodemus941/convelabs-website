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

  // Check if patient already has insurance card on file
  React.useEffect(() => {
    const email = getValues('patientDetails.email');
    if (email && isInsuranceRequired) {
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

    // Step 1: show files in UI right away
    onFilesSelected([...selectedFiles, ...acceptedFiles]);
    setValue('labOrder.hasFile', true);
    setValue('labOrder.skipped', false);

    // Step 2: upload to storage so OCR can read them + so checkout doesn't re-upload
    const previouslyUploaded: string[] = (getValues('labOrder.uploadedPaths' as any) || []) as any;
    const newPaths: string[] = [];
    for (const file of acceptedFiles) {
      const fileName = `laborder_${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('lab-orders').upload(fileName, file);
      if (!error) newPaths.push(fileName);
      else console.warn('Immediate lab-order upload failed (will retry at checkout):', error);
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
        // CRITICAL: clear the top-level `time` and `date` so the slot grid
        // remounts with the new service's window. Prior bug stored the cleared
        // value at `serviceDetails.timeSlot` which isn't the field the grid
        // reads — the patient's old fasting-window time persisted, and the
        // grid kept showing fasting slots even though selectedService had
        // changed underneath.
        setValue('serviceDetails.selectedService', 'routine-blood-draw');
        setValue('serviceDetails.duration', 60);
        setValue('serviceDetails.sameDay', false);
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
        // Routine picked but order requires fasting → switch to fasting
        setValue('serviceDetails.selectedService', 'fasting-blood-draw');
        setValue('serviceDetails.duration', 60);
        setValue('serviceDetails.sameDay', false);
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

  // Insurance dropzone + auto OCR
  const onDropInsurance = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0 && onInsuranceFileSelected) {
      const file = acceptedFiles[0];
      onInsuranceFileSelected(file);
      setValue('labOrder.hasInsuranceFile', true);

      // Auto-trigger OCR if it's an image
      if (file.type.startsWith('image/')) {
        setOcrProcessing(true);
        try {
          // Convert file to base64
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
          });

          const { data, error } = await supabase.functions.invoke('extract-insurance-ocr', {
            body: { imageBase64: base64 },
          });

          if (!error && data?.success && data?.data) {
            setOcrResult(data.data);
            toast.success('Insurance info extracted from card!');
          }
        } catch (err) {
          console.error('OCR error:', err);
          // Non-blocking — OCR failure doesn't prevent booking
        } finally {
          setOcrProcessing(false);
        }
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

  const handleRemoveInsurance = () => {
    if (onInsuranceFileSelected) onInsuranceFileSelected(null);
    setValue('labOrder.hasInsuranceFile', false);
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
  const hasInsurance = !isInsuranceRequired || selectedInsuranceFile !== null || hasInsuranceOnFile;
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
                The fastest path: ask your doctor's office to <strong>fax it to (941) 527-9169</strong> —
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

        {/* Insurance Upload (for Mobile & Senior) */}
        {isInsuranceRequired && (
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
