
import { supabase } from '@/integrations/supabase/client';
import { Document } from '@/types/documents';

export const createDocument = async (document: Partial<Document>, file: File, roles: string[]) => {
  try {
    // 1. Upload file to storage
    const filePath = `documents/${document.document_type}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // 2. Create document record
    const { data: documentData, error: documentError } = await supabase
      .from('documents')
      .insert({
        title: document.title!,
        description: document.description,
        file_path: filePath,
        category_id: document.category_id,
        document_type: document.document_type!,
        version: document.version || 1,
        is_draft: document.is_draft !== undefined ? document.is_draft : true,
        created_by: document.created_by
      })
      .select()
      .single();

    if (documentError) throw documentError;

    // 3. Create document access roles
    const roleAccess = roles.map(role => ({
      document_id: documentData.id,
      role
    }));

    const { error: rolesError } = await supabase
      .from('document_role_access')
      .insert(roleAccess);

    if (rolesError) throw rolesError;

    return documentData as Document;
  } catch (error) {
    console.error('Error creating document:', error);
    throw error;
  }
};

export const updateDocument = async (id: string, document: Partial<Document>, file?: File) => {
  try {
    let filePath = document.file_path;
    
    // If new file is provided, upload it
    if (file) {
      filePath = `documents/${document.document_type}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;
    }

    // Update document record
    const { data, error } = await supabase
      .from('documents')
      .update({
        title: document.title!,
        description: document.description,
        file_path: filePath!,
        category_id: document.category_id,
        document_type: document.document_type!,
        version: document.version!,
        is_draft: document.is_draft!,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Create a new version record if version is incremented
    if (document.version && file) {
      const { error: versionError } = await supabase
        .from('document_versions')
        .insert({
          document_id: id,
          version_number: document.version,
          file_path: filePath,
          change_notes: document.description || null,
          created_by: document.created_by
        });

      if (versionError) throw versionError;
    }

    return data as Document;
  } catch (error) {
    console.error('Error updating document:', error);
    throw error;
  }
};
