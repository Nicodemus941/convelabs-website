
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  fetchDocuments, 
  fetchDocumentById, 
  fetchDocumentsByRole,
  fetchDocumentCategories,
  createDocument, 
  updateDocument,
  fetchDocumentRoles,
  updateDocumentRoles,
  fetchDocumentVersions,
  acknowledgeDocument,
  checkDocumentAcknowledgment,
  getDocumentAcknowledgments,
  getDocumentFileUrl,
  downloadDocument
} from '@/services/documents';
import { Document, DocumentCategory } from '@/types/documents';
import { useAuth } from '@/contexts/AuthContext';

export const useDocuments = (type?: 'sop' | 'system_documentation') => {
  return useQuery({
    queryKey: ['documents', type],
    queryFn: () => fetchDocuments(type)
  });
};

export const useDocumentsByRole = (role: string) => {
  return useQuery({
    queryKey: ['documents', 'role', role],
    queryFn: () => fetchDocumentsByRole(role),
    enabled: !!role
  });
};

export const useDocument = (id: string) => {
  return useQuery({
    queryKey: ['document', id],
    queryFn: () => fetchDocumentById(id),
    enabled: !!id
  });
};

export const useDocumentCategories = () => {
  return useQuery({
    queryKey: ['documentCategories'],
    queryFn: fetchDocumentCategories
  });
};

export const useDocumentRoles = (documentId: string) => {
  return useQuery({
    queryKey: ['documentRoles', documentId],
    queryFn: () => fetchDocumentRoles(documentId),
    enabled: !!documentId
  });
};

export const useDocumentVersions = (documentId: string) => {
  return useQuery({
    queryKey: ['documentVersions', documentId],
    queryFn: () => fetchDocumentVersions(documentId),
    enabled: !!documentId
  });
};

export const useDocumentAcknowledgment = (documentId: string, version: number) => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['documentAcknowledgment', documentId, user?.id, version],
    queryFn: () => checkDocumentAcknowledgment(documentId, user?.id || '', version),
    enabled: !!documentId && !!user?.id && !!version
  });
};

export const useDocumentAcknowledgments = (documentId: string) => {
  return useQuery({
    queryKey: ['documentAcknowledgments', documentId],
    queryFn: () => getDocumentAcknowledgments(documentId),
    enabled: !!documentId
  });
};

export const useCreateDocument = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ document, file, roles }: { document: Partial<Document>, file: File, roles: string[] }) => {
      return createDocument({
        ...document,
        created_by: user?.id
      }, file, roles);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    }
  });
};

export const useUpdateDocument = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, document, file }: { id: string, document: Partial<Document>, file?: File }) => {
      return updateDocument(id, document, file);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['document', id] });
      queryClient.invalidateQueries({ queryKey: ['documentVersions', id] });
    }
  });
};

export const useUpdateDocumentRoles = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ documentId, roles }: { documentId: string, roles: string[] }) => {
      return updateDocumentRoles(documentId, roles);
    },
    onSuccess: (_, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['documentRoles', documentId] });
    }
  });
};

export const useAcknowledgeDocument = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: ({ documentId, version }: { documentId: string, version: number }) => {
      return acknowledgeDocument(documentId, user?.id || '', version);
    },
    onSuccess: (_, { documentId, version }) => {
      queryClient.invalidateQueries({ queryKey: ['documentAcknowledgment', documentId, user?.id, version] });
      queryClient.invalidateQueries({ queryKey: ['documentAcknowledgments', documentId] });
    }
  });
};

export const useDocumentFileUrl = (filePath: string | undefined) => {
  return useQuery({
    queryKey: ['documentFileUrl', filePath],
    queryFn: () => getDocumentFileUrl(filePath || ''),
    enabled: !!filePath
  });
};
