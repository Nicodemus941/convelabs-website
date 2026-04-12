
import { supabase } from '@/integrations/supabase/client';

// File handling
export const getDocumentFileUrl = async (filePath: string) => {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, 3600); // URL valid for 1 hour

  if (error) throw error;
  return data.signedUrl;
};

export const downloadDocument = async (filePath: string) => {
  const { data, error } = await supabase.storage
    .from('documents')
    .download(filePath);

  if (error) throw error;
  return data;
};
