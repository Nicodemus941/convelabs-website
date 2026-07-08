import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Document, Page, pdfjs } from 'react-pdf';

// Wire up the pdfjs worker HERE (inside the lazily-loaded chunk) so react-pdf
// only ever initializes when an admin actually expands a PDF row. If pdfjs.version
// tree-shakes to undefined, fall back to a pinned version so we never ship a
// /undefined/pdf.worker.min.js URL that 404s. (Naquala 2026-05-12: blank screen +
// lab orders won't upload — root cause was react-pdf/pdfjs blowing up at module
// load on her Edge browser and taking the whole panel — dropzone included — down.
// This whole module is now code-split + lazy so a react-pdf failure can NEVER
// break the upload path again.)
try {
  const v = (pdfjs as any).version && (pdfjs as any).version !== 'undefined'
    ? (pdfjs as any).version
    : '3.11.174'; // safe fallback — matches react-pdf 7.x's bundled pdfjs
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${v}/pdf.worker.min.js`;
} catch {
  /* swallow — thumbnails are best-effort */
}

/**
 * Small PDF thumbnail strip — shows up to N pages side-by-side.
 * Lazily imported by AppointmentLabOrdersPanel so react-pdf is never in the
 * critical upload path. Rendered inside an AdminErrorBoundary at the call site.
 */
const PdfLabThumbnail: React.FC<{ filePath: string; pages: number }> = ({ filePath, pages }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.storage.from('lab-orders').createSignedUrl(filePath, 3600);
      setUrl(data?.signedUrl || null);
    })();
  }, [filePath]);
  if (!url) return <div className="h-20 bg-gray-100 rounded animate-pulse" />;
  return (
    <div className="flex gap-1.5 overflow-x-auto">
      <Document file={url} loading={<div className="h-20 w-16 bg-gray-100 rounded animate-pulse" />}>
        {Array.from({ length: pages }, (_, i) => (
          <div key={i} className="border border-gray-200 rounded overflow-hidden flex-shrink-0 bg-white">
            <Page pageNumber={i + 1} height={80} renderTextLayer={false} renderAnnotationLayer={false} />
          </div>
        ))}
      </Document>
    </div>
  );
};

export default PdfLabThumbnail;
