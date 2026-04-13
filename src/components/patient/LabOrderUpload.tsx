import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface LabOrderUploadProps {
  appointmentId: string;
  onUploadComplete: () => void;
}

const LabOrderUpload: React.FC<LabOrderUploadProps> = ({ 
  appointmentId, 
  onUploadComplete 
}) => {
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Please upload a PDF or image file (JPG, PNG)');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }

      setSelectedFile(file);
    }
  };

  const uploadFile = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);

      // Generate unique filename (flat path in lab-orders bucket)
      const fileName = `laborder_${appointmentId}_${Date.now()}_${selectedFile.name}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('lab-orders')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Update appointment record with file path
      const { data: appt } = await supabase.from('appointments').select('lab_order_file_path').eq('id', appointmentId).single();
      const existingPath = appt?.lab_order_file_path || '';
      const newPath = existingPath ? `${existingPath}, ${fileName}` : fileName;

      const { error: updateError } = await supabase.from('appointments')
        .update({ lab_order_file_path: newPath })
        .eq('id', appointmentId);

      if (updateError) throw updateError;

      toast.success('Lab order uploaded successfully! Your phlebotomist will be able to view it.');
      setSelectedFile(null);
      onUploadComplete();

    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload lab order');
    } finally {
      setUploading(false);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Lab Order
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="file-upload">Select Lab Order File</Label>
          <Input
            id="file-upload"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileSelect}
            className="cursor-pointer"
          />
          <p className="text-xs text-muted-foreground">
            Accepted formats: PDF, JPG, PNG (Max 10MB)
          </p>
        </div>

        {selectedFile && (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="text-sm font-medium">{selectedFile.name}</span>
              <span className="text-xs text-muted-foreground">
                ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={removeFile}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Button
          onClick={uploadFile}
          disabled={!selectedFile || uploading}
          className="w-full"
        >
          {uploading ? 'Uploading...' : 'Upload Lab Order'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default LabOrderUpload;