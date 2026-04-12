
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useDocumentAcknowledgment, useAcknowledgeDocument, useDocumentFileUrl } from '@/hooks/useDocuments';
import { CheckCircle2, FileText } from 'lucide-react';
import { Document } from '@/types/documents';
import { format } from 'date-fns';

interface DocumentAcknowledgmentProps {
  document: Document;
}

const DocumentAcknowledgment: React.FC<DocumentAcknowledgmentProps> = ({ document }) => {
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const { data: fileUrl } = useDocumentFileUrl(document.file_path);
  
  const { data: acknowledgment, isLoading } = useDocumentAcknowledgment(document.id, document.version);
  const { mutate: acknowledgeDocument, isPending: isAcknowledging } = useAcknowledgeDocument();

  const handleAcknowledge = () => {
    acknowledgeDocument(
      { documentId: document.id, version: document.version },
      {
        onSuccess: () => {
          setConfirmDialogOpen(false);
        }
      }
    );
  };

  const isAcknowledged = !!acknowledgment;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{document.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500 mb-4">
            {document.description || "Please review this document and acknowledge that you've read and understood it."}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between items-center">
          {isAcknowledged && acknowledgment && (
            <div className="flex items-center text-green-600">
              <CheckCircle2 className="h-5 w-5 mr-2" />
              <span className="text-sm">Acknowledged on {format(new Date(acknowledgment.acknowledged_at), 'MMM d, yyyy')}</span>
            </div>
          )}
          {!isAcknowledged && (
            <div className="text-sm text-amber-600">Requires acknowledgment</div>
          )}

          <div className="flex gap-2">
            {fileUrl && (
              <Button variant="outline" size="sm" onClick={() => window.open(fileUrl, '_blank')}>
                <FileText className="h-4 w-4 mr-2" />
                View Document
              </Button>
            )}
            
            {!isAcknowledged && (
              <Button size="sm" onClick={() => setConfirmDialogOpen(true)}>
                Acknowledge
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Acknowledgment</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            By acknowledging this document, you confirm that you have read, understood, and agree to follow the procedures outlined in "{document.title}".
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAcknowledge} 
              disabled={isAcknowledging}
            >
              {isAcknowledging ? 'Processing...' : 'I Acknowledge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DocumentAcknowledgment;
