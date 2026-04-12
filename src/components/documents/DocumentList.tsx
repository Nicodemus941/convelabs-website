
import React from 'react';
import { Document } from '@/types/documents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { File, FileText, Pencil, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import DocumentViewer from './DocumentViewer';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface DocumentListProps {
  documents: Document[];
  onEdit?: (document: Document) => void;
  onDelete?: (document: Document) => void;
  showAcknowledged?: boolean;
  acknowledgedIds?: string[];
  isLoading?: boolean;
}

const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  onEdit,
  onDelete,
  showAcknowledged = false,
  acknowledgedIds = [],
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-conve-gold"></div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center p-12 border rounded-md bg-gray-50">
        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900">No documents found</h3>
        <p className="mt-1 text-sm text-gray-500">
          There are no documents available at this time.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {documents.map((doc) => (
        <Card key={doc.id} className={cn(
          "overflow-hidden transition-all",
          doc.is_draft && "border-dashed border-yellow-300 bg-yellow-50"
        )}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-gray-100 rounded-md">
                  <File className="h-6 w-6 text-conve-gold" />
                </div>
                <div>
                  <CardTitle className="text-lg">{doc.title}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {doc.category && (
                      <Badge variant="outline">{doc.category.name}</Badge>
                    )}
                    <Badge variant={doc.document_type === 'sop' ? 'default' : 'secondary'}>
                      {doc.document_type === 'sop' ? 'SOP' : 'Documentation'}
                    </Badge>
                    {doc.is_draft && (
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
                        Draft
                      </Badge>
                    )}
                    {showAcknowledged && (
                      acknowledgedIds?.includes(doc.id) ? (
                        <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-200">
                          <CheckCircle className="h-3 w-3 mr-1" /> Acknowledged
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-100 text-red-800 hover:bg-red-200">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Requires Acknowledgment
                        </Badge>
                      )
                    )}
                  </div>
                </div>
              </div>
              {onEdit && onDelete && (
                <div className="flex space-x-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onEdit(doc)}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => onDelete(doc)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-500 mb-4 line-clamp-2">
              {doc.description || "No description provided."}
            </div>
            <div className="flex justify-between items-center">
              <p className="text-xs text-gray-400">
                Updated {formatDistanceToNow(new Date(doc.updated_at), { addSuffix: true })}
                {doc.version > 1 && ` • Version ${doc.version}`}
              </p>
              <DocumentViewer
                filePath={doc.file_path}
                title={doc.title}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default DocumentList;
