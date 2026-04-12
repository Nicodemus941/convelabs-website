
import { supabase } from '@/integrations/supabase/client';
import { DocumentAcknowledgment } from '@/types/documents';

// Document Acknowledgments
export const acknowledgeDocument = async (documentId: string, userId: string, version: number) => {
  const { data, error } = await supabase
    .from('document_acknowledgments')
    .insert({
      document_id: documentId,
      user_id: userId,
      version_acknowledged: version
    })
    .select()
    .single();

  if (error) throw error;
  return data as DocumentAcknowledgment;
};

export const checkDocumentAcknowledgment = async (documentId: string, userId: string, version: number) => {
  const { data, error } = await supabase
    .from('document_acknowledgments')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .eq('version_acknowledged', version)
    .maybeSingle();

  if (error) throw error;
  return data as DocumentAcknowledgment | null;
};

export const getDocumentAcknowledgments = async (documentId: string) => {
  const { data, error } = await supabase
    .from('document_acknowledgments')
    .select(`
      *,
      user:profiles!document_acknowledgments_user_id_fkey(id, email, full_name)
    `)
    .eq('document_id', documentId)
    .order('acknowledged_at', { ascending: false });

  if (error) throw error;
  return data;
};
