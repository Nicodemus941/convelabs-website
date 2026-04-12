import React, { useState, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChevronLeft, Upload, FileText, X, Phone, SkipForward } from 'lucide-react';
import { BookingFormValues } from '@/types/appointmentTypes';

interface LabOrderUploadStepProps {
  onNext: () => void;
  onBack: () => void;
  onFileSelected: (file: File | null) => void;
  selectedFile: File | null;
}

const LabOrderUploadStep: React.FC<LabOrderUploadStepProps> = ({
  onNext,
  onBack,
  onFileSelected,
  selectedFile,
}) => {
  const { setValue, getValues } = useFormContext<BookingFormValues>();
  const [mode, setMode] = useState<'upload' | 'fax' | 'skip'>(
    getValues('labOrder.skipped') ? 'skip' : 'upload'
  );
  const [faxNumber, setFaxNumber] = useState(getValues('labOrder.doctorFaxNumber') || '');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileSelected(acceptedFiles[0]);
      setValue('labOrder.hasFile', true);
      setValue('labOrder.skipped', false);
    }
  }, [onFileSelected, setValue]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/heic': ['.heic'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const handleRemoveFile = () => {
    onFileSelected(null);
    setValue('labOrder.hasFile', false);
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

  const canProceed = mode === 'skip' || selectedFile !== null || (mode === 'fax' && faxNumber.length >= 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lab Order</CardTitle>
        <CardDescription>
          Upload your lab order, or we can get it from your doctor. You can also skip this step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload zone */}
        {mode === 'upload' && !selectedFile && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">
              {isDragActive ? 'Drop your lab order here' : 'Drag & drop your lab order'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse. PDF, JPG, PNG, HEIC (max 10MB)
            </p>
          </div>
        )}

        {/* File preview */}
        {mode === 'upload' && selectedFile && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
            <FileText className="h-8 w-8 text-green-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(0)} KB
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleRemoveFile}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Doctor fax mode */}
        {mode === 'fax' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <p className="font-medium">Doctor's Fax Number</p>
            </div>
            <p className="text-sm text-muted-foreground">
              We'll contact your doctor's office to retrieve your lab order.
            </p>
            <Input
              type="tel"
              placeholder="(555) 123-4567"
              value={faxNumber}
              onChange={(e) => setFaxNumber(e.target.value)}
            />
          </div>
        )}

        {/* Skip mode */}
        {mode === 'skip' && (
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <SkipForward className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No lab order provided. You can upload it later from your dashboard, or bring it to your appointment.
            </p>
          </div>
        )}

        {/* Mode toggles */}
        <div className="flex flex-wrap gap-2 text-sm">
          {mode !== 'upload' && (
            <Button variant="link" size="sm" className="px-0" onClick={() => setMode('upload')}>
              Upload a lab order
            </Button>
          )}
          {mode !== 'fax' && (
            <Button variant="link" size="sm" className="px-0" onClick={handleFaxMode}>
              Have us get it from your doctor
            </Button>
          )}
          {mode !== 'skip' && (
            <Button variant="link" size="sm" className="px-0" onClick={handleSkip}>
              Skip for now
            </Button>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button type="button" variant="outline" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button type="button" onClick={handleNext} disabled={!canProceed}>
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default LabOrderUploadStep;
