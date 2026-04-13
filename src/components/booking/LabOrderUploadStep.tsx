import React, { useState, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChevronLeft, Upload, FileText, X, Phone, SkipForward, Shield, Loader2, CheckCircle } from 'lucide-react';
import { BookingFormValues } from '@/types/appointmentTypes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import LabDestinationSelector from './LabDestinationSelector';

interface LabOrderUploadStepProps {
  onNext: () => void;
  onBack: () => void;
  onFilesSelected: (files: File[]) => void;
  selectedFiles: File[];
  onInsuranceFileSelected?: (file: File | null) => void;
  selectedInsuranceFile?: File | null;
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

  // Lab order dropzone — supports multiple files
  const onDropLabOrder = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFilesSelected([...selectedFiles, ...acceptedFiles]);
      setValue('labOrder.hasFile', true);
      setValue('labOrder.skipped', false);
    }
  }, [onFilesSelected, selectedFiles, setValue]);

  const { getRootProps: getLabOrderRootProps, getInputProps: getLabOrderInputProps, isDragActive: isLabOrderDragActive } = useDropzone({
    onDrop: onDropLabOrder,
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/heic': ['.heic'] },
    multiple: true,
    maxSize: 10 * 1024 * 1024,
  });

  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);

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

  const handleRemoveFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    onFilesSelected(updated);
    if (updated.length === 0) setValue('labOrder.hasFile', false);
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
    </Card>
  );
};

export default LabOrderUploadStep;
