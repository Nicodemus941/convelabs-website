
import { supabase } from '@/integrations/supabase/client';
import { DocumentRoleAccess } from '@/types/documents';

// Document Role Access
export const fetchDocumentRoles = async (documentId: string) => {
  const { data, error } = await supabase
    .from('document_role_access')
    .select('*')
    .eq('document_id', documentId);

  if (error) throw error;
  return data as DocumentRoleAccess[];
};

export const updateDocumentRoles = async (documentId: string, roles: string[]) => {
  try {
    // First delete existing roles
    const { error: deleteError } = await supabase
      .from('document_role_access')
      .delete()
      .eq('document_id', documentId);

    if (deleteError) throw deleteError;

    // Then insert new roles
    const roleAccess = roles.map(role => ({
      document_id: documentId,
      role
    }));

    const { data, error } = await supabase
      .from('document_role_access')
      .insert(roleAccess)
      .select();

    if (error) throw error;
    return data as DocumentRoleAccess[];
  } catch (error) {
    console.error('Error updating document roles:', error);
    throw error;
  }
};
