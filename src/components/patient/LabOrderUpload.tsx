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

      // Use a path scoped to the appointment so storage objects line up
      // with the new normalized appointment_lab_orders model + RLS policies.
      const ext = selectedFile.name.split('.').pop() || 'bin';
      const filePath = `appointments/${appointmentId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('lab-orders')
        .upload(filePath, selectedFile, {
          contentType: selectedFile.type || 'application/octet-stream',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Insert into appointment_lab_orders so OCR + org-match + every UI
      // surface sees it (the legacy appointments.lab_order_file_path
      // column auto-syncs from this table via the
      // sync_appointment_lab_order_file_path trigger).
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      // Compute a content sha so the unique-on-(appointment_id, sha) dedup works
      const buf = await selectedFile.arrayBuffer();
      const hashBuf = await crypto.subtle.digest('SHA-256', buf);
      const sha = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const { data: inserted, error: insErr } = await supabase
        .from('appointment_lab_orders')
        .insert({
          appointment_id: appointmentId,
          file_path: filePath,
          original_filename: selectedFile.name,
          content_sha256: sha,
          file_size_bytes: selectedFile.size,
          mime_type: selectedFile.type || 'application/octet-stream',
          page_count: selectedFile.type === 'application/pdf' ? null : 1,
          ocr_status: 'pending',
          uploaded_by: currentUser?.id || null,
        })
        .select('id')
        .single();

      if (insErr) {
        // Duplicate (same file already attached) — treat as a soft success.
        if ((insErr as any).code === '23505') {
          toast.info('This lab order is already attached.');
          setSelectedFile(null);
          onUploadComplete();
          return;
        }
        throw insErr;
      }

      // Fire OCR (non-blocking — caller doesn't wait on the result)
      if (inserted?.id) {
        supabase.functions.invoke('ocr-lab-order', { body: { labOrderId: inserted.id } })
          .then(() => {}, () => {});
      }

      toast.success('Lab order uploaded! Your phlebotomist will be able to view it.');
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