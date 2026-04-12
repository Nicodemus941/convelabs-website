
import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Upload } from 'lucide-react';

const UploadAgreement: React.FC = () => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const isAdmin = user?.role === 'super_admin';
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };
  
  const handleUpload = async () => {
    if (!isAdmin) {
      toast.error('You do not have permission to upload agreements');
      return;
    }
    
    if (!name.trim()) {
      toast.error('Please enter a name for the agreement');
      return;
    }
    
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Upload the document to storage
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('agreement_documents')
        .upload(fileName, file);
      
      if (uploadError) {
        throw new Error('Error uploading file');
      }
      
      // Create the agreement record
      const { error: dbError } = await supabase
        .from('agreements')
        .insert({
          name,
          description: description || null,
          document_path: fileName,
          version: version,
          is_active: true
        });
      
      if (dbError) {
        // Delete the uploaded file if record creation fails
        await supabase.storage
          .from('agreement_documents')
          .remove([fileName]);
          
        throw new Error('Error creating agreement record');
      }
      
      toast.success('Agreement uploaded successfully');
      
      // Reset form
      setName('');
      setDescription('');
      setVersion(1);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (error: any) {
      console.error('Error uploading agreement:', error);
      toast.error(error.message || 'Failed to upload agreement');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center">
            <p>You do not have permission to manage agreements</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Agreement Document</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Agreement Name</Label>
            <Input 
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Terms and Conditions"
            />
          </div>
          
          <div>
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the agreement"
            />
          </div>
          
          <div>
            <Label htmlFor="version">Version</Label>
            <Input 
              id="version"
              type="number"
              value={version}
              onChange={e => setVersion(parseInt(e.target.value) || 1)}
              min={1}
            />
          </div>
          
          <div>
            <Label htmlFor="document">Document File (DOCX, PDF)</Label>
            <Input
              id="document"
              type="file"
              ref={fileInputRef}
              accept=".docx,.pdf,.doc"
              onChange={handleFileChange}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Upload DOCX or PDF files only
            </p>
          </div>
          
          <Button
            onClick={handleUpload}
            disabled={isSubmitting || !file || !name.trim()}
            className="w-full"
          >
            {isSubmitting ? (
              'Uploading...'
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> Upload Agreement
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default UploadAgreement;
