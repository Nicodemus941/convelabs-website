
export interface DocumentCategory {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  title: string;
  description: string | null;
  file_path: string;
  category_id: string;
  document_type: 'sop' | 'system_documentation';
  version: number;
  is_draft: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  category?: DocumentCategory;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  file_path: string;
  change_notes: string | null;
  created_by: string;
  published_at: string;
}

export interface DocumentRoleAccess {
  id: string;
  document_id: string;
  role: string;
  created_at: string;
}

export interface DocumentAcknowledgment {
  id: string;
  document_id: string;
  user_id: string;
  acknowledged_at: string;
  version_acknowledged: number;
}
