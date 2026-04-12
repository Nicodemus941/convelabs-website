import React, { useState, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChevronLeft, Upload, FileText, X, Phone, SkipForward, Shield } from 'lucide-react';
import { BookingFormValues } from '@/types/appointmentTypes';
import LabDestinationSelector from './LabDestinationSelector';

interface LabOrderUploadStepProps {
  onNext: () => void;
  onBack: () => void;
  onFileSelected: (file: File | null) => void;
  selectedFile: File | null;
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
  onFileSelected,
  selectedFile,
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

  const [mode, setMode] = useState<'upload' | 'fax' | 'skip'>(
    getValues('labOrder.skipped') ? 'skip' : 'upload'
  );
  const [faxNumber, setFaxNumber] = useState(getValues('labOrder.doctorFaxNumber') || '');

  // Lab order dropzone
  const onDropLabOrder = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileSelected(acceptedFiles[0]);
      setValue('labOrder.hasFile', true);
      setValue('labOrder.skipped', false);
    }
  }, [onFileSelected, setValue]);

  const { getRootProps: getLabOrderRootProps, getInputProps: getLabOrderInputProps, isDragActive: isLabOrderDragActive } = useDropzone({
    onDrop: onDropLabOrder,
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/heic': ['.heic'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  // Insurance dropzone
  const onDropInsurance = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0 && onInsuranceFileSelected) {
      onInsuranceFileSelected(acceptedFiles[0]);
      setValue('labOrder.hasInsuranceFile', true);
    }
  }, [onInsuranceFileSelected, setValue]);

  const { getRootProps: getInsuranceRootProps, getInputProps: getInsuranceInputProps, isDragActive: isInsuranceDragActive } = useDropzone({
    onDrop: onDropInsurance,
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/heic': ['.heic'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const handleRemoveFile = () => {
    onFileSelected(null);
    setValue('labOrder.hasFile', false);
  };

  const handleRemoveInsurance = () => {
    if (onInsuranceFileSelected) onInsuranceFileSelected(null);
    setValue('labOrder.hasInsuranceFile', false);
  };

  const handleFaxMode = () => {
    setMode('fax');
    onFileSelected(null);
    setValue('labOrder.hasFile', false);
    setValue('labOrder.skipped', false);
  };

  const handleSkip = () => {
    setMode('skip');
    onFileSelected(null);
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

  const hasLabOrder = selectedFile !== null || (mode === 'fax' && faxNumber.length >= 10) || mode === 'skip';
  const hasInsurance = !isInsuranceRequired || selectedInsuranceFile !== null;
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

          {mode === 'upload' && !selectedFile && (
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

          {mode === 'upload' && selectedFile && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
              <FileText className="h-6 w-6 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(0)} KB</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRemoveFile}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {mode === 'fax' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">We'll contact your doctor to retrieve your lab order.</p>
              <Input type="tel" placeholder="Doctor's fax: (555) 123-4567" value={faxNumber} onChange={(e) => setFaxNumber(e.target.value)} />
            </div>
          )}

          {mode === 'skip' && (
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">No lab order provided. You can upload it later or bring it to your appointment.</p>
            </div>
          )}

          {/* Mode toggles */}
          <div className="flex flex-wrap gap-2 text-xs">
            {mode !== 'upload' && (
              <Button variant="link" size="sm" className="px-0 h-auto text-xs" onClick={() => setMode('upload')}>Upload a lab order</Button>
            )}
            {mode !== 'fax' && (
              <Button variant="link" size="sm" className="px-0 h-auto text-xs" onClick={handleFaxMode}>Get from doctor</Button>
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
                Insurance Card <span className="text-red-500">*</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a photo of your insurance card (front and back recommended).
            </p>

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
          </div>
        )}

        {/* Lab Destination Selector */}
        {needsLabDestination && (
          <div className="border-t pt-5">
            <LabDestinationSelector visitType={visitType} />
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
