
import { supabase } from '@/integrations/supabase/client';
import { DocumentCategory } from '@/types/documents';

// Categories
export const fetchDocumentCategories = async () => {
  const { data, error } = await supabase
    .from('document_categories')
    .select('*')
    .order('name');

  if (error) throw error;
  return data as DocumentCategory[];
};

export const createDocumentCategory = async (category: Partial<DocumentCategory>) => {
  if (!category.name) {
    throw new Error("Category name is required");
  }
  
  const { data, error } = await supabase
    .from('document_categories')
    .insert({
      name: category.name,
      description: category.description || null
    })
    .select()
    .single();

  if (error) throw error;
  return data as DocumentCategory;
};
