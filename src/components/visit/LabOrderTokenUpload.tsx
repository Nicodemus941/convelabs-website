import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, FileText, X, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lab-order upload for the no-login /visit/:token page.
 *
 * Reuses the existing view_token for auth — same trust model that lets
 * anonymous visitors view their appointment details, reschedule, and
 * cancel. Calls the upload-lab-order-token edge function which validates
 * the token server-side and stamps appointments.lab_order_file_path.
 *
 * Hides itself once an upload succeeds so patients don't feel nagged.
 */

interface Props {
  viewToken: string;
  alreadyUploaded: boolean;
  onUploaded?: (newPath: string) => void;
}

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif'];

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const out = String(r.result || '').split(',')[1] || '';
      resolve(out);
    };
    r.onerror = () => reject(new Error('read_failed'));
    r.readAsDataURL(file);
  });

const LabOrderTokenUpload: React.FC<Props> = ({ viewToken, alreadyUploaded, onUploaded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(alreadyUploaded);

  if (done) {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="flex items-center gap-3 py-4 px-5">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">Lab order on file</p>
            <p className="text-xs text-emerald-700 mt-0.5">Your phlebotomist will see it before arrival. You're all set.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ALLOWED.includes(f.type)) {
      toast.error('Please upload a PDF or image (JPG, PNG, HEIC).');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10 MB.');
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const content_base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('upload-lab-order-token', {
        body: {
          view_token: viewToken,
          filename: file.name,
          content_type: file.type,
          content_base64,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any)?.message || (data as any)?.error);
      toast.success('Lab order uploaded — thanks!');
      setDone(true);
      setFile(null);
      onUploaded?.((data as any)?.lab_order_file_path);
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed — please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-amber-900">
          <FileText className="h-5 w-5 text-amber-600" />
          Upload your lab order
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-amber-900 leading-relaxed">
          Upload the lab order from your doctor so your phlebotomist knows exactly what to collect. PDF, JPG, PNG, or HEIC up to 10 MB.
        </p>

        {!file ? (
          <Label className="flex items-center justify-center gap-2 w-full bg-white border-2 border-dashed border-amber-300 rounded-lg py-4 px-4 cursor-pointer hover:border-amber-500 hover:bg-amber-100 transition">
            <Upload className="h-5 w-5 text-amber-700" />
            <span className="text-sm font-semibold text-amber-900">Choose a file</span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
              className="hidden"
              onChange={onSelect}
              disabled={uploading}
            />
          </Label>
        ) : (
          <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
            <FileText className="h-4 w-4 text-amber-700 flex-shrink-0" />
            <span className="text-sm text-gray-900 truncate flex-1">{file.name}</span>
            <span className="text-[11px] text-gray-500 flex-shrink-0">{(file.size / 1024 / 1024).toFixed(1)}&nbsp;MB</span>
            <button
              type="button"
              onClick={() => setFile(null)}
              disabled={uploading}
              className="text-gray-400 hover:text-red-600"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <Button
          onClick={submit}
          disabled={!file || uploading}
          className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white"
        >
          {uploading ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Uploading…</> : 'Upload lab order'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default LabOrderTokenUpload;
