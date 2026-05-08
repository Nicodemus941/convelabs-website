import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDropzone } from 'react-dropzone';
import { Shield, CheckCircle2, AlertCircle, Loader2, Camera } from 'lucide-react';
import { toast } from 'sonner';

/**
 * /insurance/update/:token  — public, no-login self-serve insurance card upload.
 *
 * Token is minted by the expiry-pulse cron OR by admin-send. Patient lands
 * here from an SMS/email link. Two-step flow:
 *
 *   1. Front of card  (required) — upload, OCR auto-fills provider+memberId
 *   2. Back of card   (optional) — phone for member services / claims
 *
 * After front-side save, token is consumed (single-use). Back-side stays
 * available within the 14-day window.
 *
 * Hormozi: minimal friction. No login. No password. One screen, one job.
 */

interface PreviewData {
  first_name: string;
  current_provider: string | null;
  has_front: boolean;
  has_back: boolean;
}

const InsuranceUpdatePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<'front' | 'back' | null>(null);
  const [frontDone, setFrontDone] = useState(false);
  const [backDone, setBackDone] = useState(false);

  // Load token preview
  useEffect(() => {
    let cancelled = false;
    if (!token) { setLoadError('No token in URL.'); setLoading(false); return; }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('insurance-self-upload', {
          body: { token, mode: 'preview' },
        });
        if (cancelled) return;
        if (error) {
          const msg = (error as any)?.message || 'Link error';
          setLoadError(msg.includes('410') ? 'This link has expired or already been used. Call us at (941) 527-9169 to receive a fresh link.' : msg);
        } else if (!data || data.error) {
          setLoadError(data?.error || 'Link error');
        } else {
          setPreview(data as PreviewData);
          setFrontDone(!!(data as any).has_front);
          setBackDone(!!(data as any).has_back);
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleUpload = useCallback(async (file: File, side: 'front' | 'back') => {
    if (!token) return;
    setUploading(side);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const safeName = `selfserve_${side}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: upErr } = await supabase.storage.from('insurance-cards').upload(safeName, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke('insurance-self-upload', {
        body: { token, mode: 'upload', side, file_path: safeName },
      });
      if (error || !data?.ok) throw new Error(data?.error || (error as any)?.message || 'Save failed');

      if (side === 'front') {
        setFrontDone(true);
        toast.success('Front of card saved. OCR is reading it now.');
      } else {
        setBackDone(true);
        toast.success('Back of card saved. Thank you!');
      }
    } catch (e: any) {
      toast.error(e?.message || `Upload failed (${side})`);
    } finally {
      setUploading(null);
    }
  }, [token]);

  const onDropFront = useCallback((files: File[]) => { if (files[0]) handleUpload(files[0], 'front'); }, [handleUpload]);
  const onDropBack  = useCallback((files: File[]) => { if (files[0]) handleUpload(files[0], 'back');  }, [handleUpload]);

  const front = useDropzone({
    onDrop: onDropFront,
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/heic': ['.heic'], 'image/webp': ['.webp'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: !!uploading || frontDone,
  });

  const back = useDropzone({
    onDrop: onDropBack,
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/heic': ['.heic'], 'image/webp': ['.webp'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: !!uploading || backDone,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
            <h1 className="text-lg font-bold text-gray-900 mb-2">Link unavailable</h1>
            <p className="text-sm text-gray-600 mb-4">{loadError}</p>
            <Button asChild className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
              <a href="tel:9415279169">Call (941) 527-9169</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 p-4 flex items-start justify-center pt-12">
      <div className="max-w-md w-full space-y-4">
        {/* Header */}
        <Card className="border-2 border-[#B91C1C] shadow-lg overflow-hidden">
          <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white p-5 text-center">
            <Shield className="h-8 w-8 mx-auto mb-2" />
            <h1 className="text-xl font-bold">Update your insurance</h1>
            <p className="text-sm text-red-100 mt-1">Hi {preview?.first_name}, takes 30 seconds.</p>
          </div>
          {preview?.current_provider && (
            <CardContent className="p-4 bg-amber-50 border-t border-amber-200">
              <p className="text-xs text-amber-900">
                <strong>Currently on file:</strong> {preview.current_provider}. Upload your latest card to update.
              </p>
            </CardContent>
          )}
        </Card>

        {/* Front-of-card */}
        <Card className={frontDone ? 'border-emerald-300 bg-emerald-50/50' : ''}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Front of card</h2>
                <p className="text-xs text-gray-500">Required · we'll auto-read the carrier + member ID</p>
              </div>
              {frontDone && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
            </div>
            {!frontDone ? (
              <div
                {...front.getRootProps()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                  front.isDragActive ? 'border-[#B91C1C] bg-red-50' : 'border-gray-300 hover:border-[#B91C1C]/50'
                } ${uploading === 'front' ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input {...front.getInputProps()} />
                {uploading === 'front' ? (
                  <><Loader2 className="h-8 w-8 mx-auto mb-2 text-[#B91C1C] animate-spin" /><p className="text-sm font-medium">Saving + reading the card…</p></>
                ) : (
                  <>
                    <Camera className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm font-medium text-gray-900">Tap or drop the front of your card</p>
                    <p className="text-xs text-gray-500 mt-1">JPG, PNG, HEIC, or PDF · 10 MB max</p>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-emerald-800">✓ Saved. We'll auto-extract the details.</p>
            )}
          </CardContent>
        </Card>

        {/* Back-of-card (Hormozi: claim-rejection prevention) */}
        <Card className={backDone ? 'border-emerald-300 bg-emerald-50/50' : ''}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Back of card</h2>
                <p className="text-xs text-gray-500">Optional · helps us verify claims by phone</p>
              </div>
              {backDone && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
            </div>
            {!backDone ? (
              <div
                {...back.getRootProps()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                  back.isDragActive ? 'border-[#B91C1C] bg-red-50' : 'border-gray-300 hover:border-[#B91C1C]/50'
                } ${uploading === 'back' ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input {...back.getInputProps()} />
                {uploading === 'back' ? (
                  <><Loader2 className="h-8 w-8 mx-auto mb-2 text-[#B91C1C] animate-spin" /><p className="text-sm font-medium">Saving…</p></>
                ) : (
                  <>
                    <Camera className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm font-medium text-gray-900">Tap or drop the back of your card</p>
                    <p className="text-xs text-gray-500 mt-1">Has the customer-service phone we need</p>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-emerald-800">✓ Saved.</p>
            )}
          </CardContent>
        </Card>

        {/* Done state */}
        {frontDone && (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="p-5 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
              <p className="font-semibold text-emerald-900">All set, thank you!</p>
              <p className="text-xs text-emerald-700 mt-1">
                Your information is saved to your chart. You can close this page.
              </p>
              <p className="text-[11px] text-gray-500 mt-3">
                Questions? Call us at (941) 527-9169.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default InsuranceUpdatePage;
