
import { supabase } from '@/integrations/supabase/client';
import { Document } from '@/types/documents';

// Fetch all documents with optional type filter
export const fetchDocuments = async (type?: 'sop' | 'system_documentation') => {
  let query = supabase
    .from('documents')
    .select(`
      *,
      category:document_categories(*)
    `)
    .order('updated_at', { ascending: false });
    
  // Add type filter if provided
  if (type) {
    query = query.eq('document_type', type);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as Document[];
};

// Fetch a single document by ID
export const fetchDocumentById = async (id: string) => {
  const { data, error } = await supabase
    .from('documents')
    .select(`
      *,
      category:document_categories(*)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Document;
};

// Fetch documents accessible by a specific role
export const fetchDocumentsByRole = async (role: string) => {
  // First get document IDs accessible by this role
  const { data: accessData, error: accessError } = await supabase
    .from('document_role_access')
    .select('document_id')
    .eq('role', role);
    
  if (accessError) throw accessError;
  
  // If no documents are accessible, return empty array
  if (!accessData || accessData.length === 0) {
    return [];
  }
  
  // Extract document IDs from the access data
  const documentIds = accessData.map(item => item.document_id);
  
  // Fetch the actual documents using those IDs
  const { data: docsData, error: docsError } = await supabase
    .from('documents')
    .select(`
      *,
      category:document_categories(*)
    `)
    .in('id', documentIds)
    .order('updated_at', { ascending: false });
    
  if (docsError) throw docsError;
  
  return docsData as Document[];
};
