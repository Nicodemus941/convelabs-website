import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, Download, FileText, AlertTriangle } from 'lucide-react';
import { supabase, publicStorageUrl } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

/**
 * LAB ORDER VIEWER — in-modal PDF/image viewer for phleb dashboard.
 *
 * Why this exists: phleb is standing at patient's door, phone in hand. Opening
 * a new browser tab kicks them out of the PWA and loses context. This modal
 * loads the file inline so they can reference it WHILE filling tubes.
 *
 * Supports PDF, JPG/PNG (images render with <img>), HEIC (fallback to download).
 */

interface Props {
  open: boolean;
  onClose: () => void;
  filePath: string | null;
  fileName?: string;
}

const LabOrderViewerModal: React.FC<Props> = ({ open, onClose, filePath, fileName }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !filePath) return;
    setLoading(true);
    setError(null);
    setSignedUrl(null);
    (async () => {
      try {
        // Strategy 1: build the public URL ourselves with per-segment
        // encodeURIComponent. Supabase JS's getPublicUrl/download don't
        // encode commas, so "Rienzi, Mary Ellen.pdf" and "Rienzi,P.pdf"
        // 404'd at the CDN. Manual encoding fixes the entire class of
        // filename bugs in one go.
        const url = publicStorageUrl('lab-orders', filePath);
        // Verify it actually resolves before locking the UI to that URL
        try {
          const head = await fetch(url, { method: 'HEAD' });
          if (head.ok) {
            setSignedUrl(url);
            return;
          }
        } catch { /* fall through to alternate paths */ }

        // Strategy 2 (fallback): SDK download() → blob URL
        const { data: blob, error: dlErr } = await supabase.storage
          .from('lab-orders')
          .download(filePath);
        if (!dlErr && blob) {
          setSignedUrl(URL.createObjectURL(blob));
          return;
        }

        // Strategy 3 (last resort): signed URL
        const { data: signed } = await supabase.storage
          .from('lab-orders')
          .createSignedUrl(filePath, 3600);
        if (signed?.signedUrl) {
          setSignedUrl(signed.signedUrl);
          return;
        }
        throw dlErr || new Error('Could not load file');
      } catch (e: any) {
        setError(e.message || 'Failed to load file');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, filePath]);

  // Revoke object URL on close to free memory
  useEffect(() => {
    return () => {
      if (signedUrl && signedUrl.startsWith('blob:')) URL.revokeObjectURL(signedUrl);
    };
  }, [signedUrl]);

  const isImage = filePath ? /\.(jpe?g|png|gif|webp)$/i.test(filePath) : false;
  const isHeic = filePath ? /\.heic$/i.test(filePath) : false;
  const isPdf = filePath ? /\.pdf$/i.test(filePath) : false;

  const display = fileName || (filePath ? filePath.split('/').pop() : 'Lab Order');

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-[#B91C1C]" />
            <span className="truncate">{display}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-gray-50 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
            </div>
          )}
          {error && (
            <div className="p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
              <p className="text-sm text-red-700 font-semibold mb-1">Couldn't load the file</p>
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
          {!loading && !error && signedUrl && (
            <>
              {isImage && (
                <img src={signedUrl} alt={display} className="w-full h-auto" />
              )}
              {isPdf && (
                <iframe
                  src={signedUrl}
                  title={display}
                  className="w-full h-full border-0 bg-white"
                />
              )}
              {isHeic && (
                <div className="p-8 text-center">
                  <p className="text-sm text-gray-700 mb-3">
                    HEIC images can't preview inline on all devices. Tap below to open it.
                  </p>
                  <Button asChild className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                    <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                      Open HEIC file
                    </a>
                  </Button>
                </div>
              )}
              {!isImage && !isPdf && !isHeic && (
                <iframe
                  src={signedUrl}
                  title={display}
                  className="w-full h-full border-0 bg-white"
                />
              )}
            </>
          )}
        </div>

        <div className="border-t px-4 py-3 flex items-center justify-between gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <div className="flex gap-2">
            {signedUrl && (
              <>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                >
                  <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
                  </a>
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-[#B91C1C] hover:bg-[#991B1B] text-white"
                  onClick={async () => {
                    try {
                      const resp = await fetch(signedUrl);
                      const blob = await resp.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = display || 'lab-order';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch {
                      toast.error('Download failed — try "Open in new tab"');
                    }
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LabOrderViewerModal;
