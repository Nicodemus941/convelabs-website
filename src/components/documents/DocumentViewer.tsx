
import React, { useState, useEffect } from 'react';
import { useDocumentFileUrl } from '@/hooks/useDocuments';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Set PDF.js worker path
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

interface DocumentViewerProps {
  filePath: string;
  title: string;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ filePath, title }) => {
  const [open, setOpen] = useState(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const { data: fileUrl, isLoading, error } = useDocumentFileUrl(filePath);
  
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const handleDownload = () => {
    if (fileUrl) {
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = title.replace(/\s+/g, '_') + '.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const isImage = filePath?.match(/\.(jpeg|jpg|gif|png|webp)$/) != null;
  const isPDF = filePath?.match(/\.(pdf)$/) != null;

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <ExternalLink className="h-4 w-4 mr-2" />
          View
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          
          <div className="mt-4">
            {isLoading ? (
              <div className="flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-conve-gold"></div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-center text-gray-500">Error loading document</p>
              </div>
            ) : isPDF ? (
              <div className="flex flex-col items-center">
                <Document
                  file={fileUrl}
                  onLoadSuccess={onDocumentLoadSuccess}
                  className="border rounded"
                >
                  <Page pageNumber={pageNumber} />
                </Document>
                <div className="flex items-center mt-4 gap-2">
                  <Button 
                    variant="outline" 
                    disabled={pageNumber <= 1} 
                    onClick={() => setPageNumber(prevPage => Math.max(prevPage - 1, 1))}
                  >
                    Previous
                  </Button>
                  <p className="text-sm">
                    Page {pageNumber} of {numPages}
                  </p>
                  <Button 
                    variant="outline" 
                    disabled={pageNumber >= (numPages || 1)} 
                    onClick={() => setPageNumber(prevPage => Math.min(prevPage + 1, numPages || 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : isImage ? (
              <div className="flex justify-center">
                <img src={fileUrl} alt={title} className="max-h-[70vh]" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20">
                <Button variant="default" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
                <p className="text-xs text-gray-500 mt-4">
                  This file type cannot be previewed. Please download to view.
                </p>
              </div>
            )}
          </div>
          
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DocumentViewer;
