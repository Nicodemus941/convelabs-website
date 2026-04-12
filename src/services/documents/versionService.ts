
import { supabase } from '@/integrations/supabase/client';
import { DocumentVersion } from '@/types/documents';

// Document Versions
export const fetchDocumentVersions = async (documentId: string) => {
  const { data, error } = await supabase
    .from('document_versions')
    .select('*')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false });

  if (error) throw error;
  return data as DocumentVersion[];
};
