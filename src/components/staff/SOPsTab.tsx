import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentCategories } from '@/hooks/useDocuments';
import DocumentList from '@/components/documents/DocumentList';
import DocumentAcknowledgment from '@/components/documents/DocumentAcknowledgment';
import { supabase } from '@/integrations/supabase/client';
import { Document } from '@/types/documents';

const SOPsTab: React.FC = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [acknowledgedIds, setAcknowledgedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  
  const { data: categories = [] } = useDocumentCategories();

  useEffect(() => {
    if (!user?.role) return;
    
    const fetchDocuments = async () => {
      try {
        setIsLoading(true);
        
        // First get document IDs accessible by this role
        const { data: accessData, error: accessError } = await supabase
          .from('document_role_access')
          .select('document_id')
          .eq('role', user.role);
          
        if (accessError) throw accessError;
        
        // If no documents are accessible, return early
        if (!accessData || accessData.length === 0) {
          setDocuments([]);
          setIsLoading(false);
          return;
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
          .eq('document_type', 'sop')
          .eq('is_draft', false)
          .in('id', documentIds)
          .order('updated_at', { ascending: false });
          
        if (docsError) throw docsError;
        
        // Fetch acknowledgments for this user
        const { data: ackData, error: ackError } = await supabase
          .from('document_acknowledgments')
          .select('document_id, version_acknowledged')
          .eq('user_id', user.id);
          
        if (ackError) throw ackError;
        
        // Set the documents and acknowledgments
        setDocuments(docsData as Document[]);
        
        // Filter acknowledgments to only include latest versions
        const acknowledgedDocIds = ackData
          .filter(ack => {
            const doc = docsData.find(d => d.id === ack.document_id);
            return doc && doc.version === ack.version_acknowledged;
          })
          .map(ack => ack.document_id);
          
        setAcknowledgedIds(acknowledgedDocIds);
      } catch (error) {
        console.error('Error fetching documents:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDocuments();
  }, [user?.role, user?.id]);

  // Filter documents based on search term and category
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
    
    const matchesCategory = selectedCategory === 'all' || doc.category_id === selectedCategory;
    
    const matchesTab = activeTab === 'all' || 
                      (activeTab === 'pending' && !acknowledgedIds.includes(doc.id));
    
    return matchesSearch && matchesCategory && matchesTab;
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Standard Operating Procedures</h2>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search documents..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="all" value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'pending')}>
        <TabsList className="mb-6">
          <TabsTrigger value="all">All Documents</TabsTrigger>
          <TabsTrigger value="pending">Pending Acknowledgment</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <DocumentList 
            documents={filteredDocuments}
            showAcknowledged
            acknowledgedIds={acknowledgedIds}
            isLoading={isLoading}
          />
        </TabsContent>
        
        <TabsContent value="pending">
          <div className="space-y-4">
            {filteredDocuments
              .filter(doc => !acknowledgedIds.includes(doc.id))
              .map(doc => (
                <DocumentAcknowledgment key={doc.id} document={doc} />
              ))
            }
            {filteredDocuments.filter(doc => !acknowledgedIds.includes(doc.id)).length === 0 && !isLoading && (
              <div className="text-center p-8 bg-green-50 rounded-md border border-green-200">
                <h3 className="text-green-800 font-medium">All caught up!</h3>
                <p className="text-green-600 text-sm mt-1">
                  You have acknowledged all required documents.
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SOPsTab;
