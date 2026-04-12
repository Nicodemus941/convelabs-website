
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Document } from '@/types/documents';
import { useDocuments, useCreateDocument, useUpdateDocument } from '@/hooks/useDocuments';
import DocumentForm from '@/components/documents/DocumentForm';
import DocumentList from '@/components/documents/DocumentList';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

const DocumentManagement: React.FC = () => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null);
  const [currentRoles, setCurrentRoles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'sop' | 'system_documentation'>('sop');

  const { 
    data: sopDocuments = [], 
    isLoading: isLoadingSops 
  } = useDocuments('sop');
  
  const { 
    data: systemDocs = [], 
    isLoading: isLoadingSystemDocs 
  } = useDocuments('system_documentation');

  const { mutate: createDocument, isPending: isCreating } = useCreateDocument();
  const { mutate: updateDocument, isPending: isUpdating } = useUpdateDocument();

  const handleAddDocument = (data: any, file: File, roles: string[]) => {
    createDocument(
      { document: { ...data }, file, roles },
      {
        onSuccess: () => {
          setIsAddDialogOpen(false);
          toast.success('Document created successfully');
        },
        onError: (error) => {
          console.error('Error creating document:', error);
          toast.error('Failed to create document');
        }
      }
    );
  };

  const handleEditDocument = (document: Document) => {
    setCurrentDocument(document);
    
    // Fetch the roles for this document
    const fetchRoles = async () => {
      try {
        const { data, error } = await supabase
          .from('document_role_access')
          .select('role')
          .eq('document_id', document.id);
          
        if (error) throw error;
        setCurrentRoles(data.map(r => r.role));
        setIsEditDialogOpen(true);
      } catch (error) {
        console.error('Error fetching roles:', error);
        toast.error('Failed to load document permissions');
      }
    };
    
    fetchRoles();
  };

  const handleUpdateDocument = (data: any, file: File | undefined, roles: string[]) => {
    if (!currentDocument) return;
    
    updateDocument(
      { 
        id: currentDocument.id, 
        document: { 
          ...data, 
          version: file ? currentDocument.version + 1 : currentDocument.version 
        },
        file
      },
      {
        onSuccess: async () => {
          // Update the roles
          try {
            await supabase
              .from('document_role_access')
              .delete()
              .eq('document_id', currentDocument.id);
              
            await supabase
              .from('document_role_access')
              .insert(roles.map(role => ({
                document_id: currentDocument.id,
                role
              })));
              
            setIsEditDialogOpen(false);
            setCurrentDocument(null);
            toast.success('Document updated successfully');
          } catch (error) {
            console.error('Error updating roles:', error);
            toast.error('Failed to update document permissions');
          }
        },
        onError: (error) => {
          console.error('Error updating document:', error);
          toast.error('Failed to update document');
        }
      }
    );
  };

  const handleDeletePrompt = (document: Document) => {
    setCurrentDocument(document);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteDocument = async () => {
    if (!currentDocument) return;
    
    try {
      // Delete the file from storage
      await supabase.storage
        .from('documents')
        .remove([currentDocument.file_path]);
      
      // Delete the document record (cascade will handle related tables)
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', currentDocument.id);
        
      if (error) throw error;
      
      setIsDeleteDialogOpen(false);
      setCurrentDocument(null);
      toast.success('Document deleted successfully');
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Failed to delete document');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Document Management</h2>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Document
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'sop' | 'system_documentation')}>
        <TabsList className="mb-6">
          <TabsTrigger value="sop">Standard Operating Procedures</TabsTrigger>
          <TabsTrigger value="system_documentation">System Documentation</TabsTrigger>
        </TabsList>

        <TabsContent value="sop">
          <DocumentList 
            documents={sopDocuments}
            onEdit={handleEditDocument}
            onDelete={handleDeletePrompt}
            isLoading={isLoadingSops}
          />
        </TabsContent>

        <TabsContent value="system_documentation">
          <DocumentList 
            documents={systemDocs}
            onEdit={handleEditDocument}
            onDelete={handleDeletePrompt}
            isLoading={isLoadingSystemDocs}
          />
        </TabsContent>
      </Tabs>

      {/* Add Document Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Add New Document</DialogTitle>
          </DialogHeader>
          <DocumentForm 
            onSubmit={handleAddDocument}
            isLoading={isCreating}
            initialData={{ document_type: activeTab } as any}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          {currentDocument && (
            <DocumentForm 
              onSubmit={handleUpdateDocument}
              initialData={currentDocument}
              isLoading={isUpdating}
              initialRoles={currentRoles}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the document and any associated versions or acknowledgments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDocument} className="bg-red-500 hover:bg-red-600">
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DocumentManagement;
