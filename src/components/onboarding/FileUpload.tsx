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
import { getUserProfileProperties } from '@/types/supabase';

const FileUpload: React.FC = () => {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };
  
  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }
    
    if (!user) {
      toast.error('You must be logged in to upload files');
      return;
    }
    
    try {
      setIsUploading(true);
      
      // Upload the file to storage
      const fileName = `${user.id}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from('lab_orders')
        .upload(fileName, file);
      
      if (uploadError) {
        throw new Error('Error uploading file');
      }
      
      // Update user profile to mark that they have uploaded lab orders
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ lab_orders_uploaded: true })
        .eq('id', user.id);
      
      if (updateError) {
        throw new Error('Error updating profile');
      }
      
      toast.success('File uploaded successfully');
      
      // Reset the file input
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Lab Order</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="file">Select File</Label>
            <Input
              id="file"
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Accepted formats: PDF, JPG, PNG
            </p>
          </div>
          
          <Button
            onClick={handleUpload}
            disabled={isUploading || !file}
            className="w-full"
          >
            {isUploading ? (
              'Uploading...'
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> Upload Lab Order
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FileUpload;
