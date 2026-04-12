
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Document, DocumentCategory } from '@/types/documents';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useDocumentCategories } from '@/hooks/useDocuments';
import DocumentUploader from './DocumentUploader';
import { UserRole } from '@/types/auth';

const formSchema = z.object({
  title: z.string().min(1, { message: 'Title is required' }),
  description: z.string().optional(),
  category_id: z.string().min(1, { message: 'Category is required' }),
  document_type: z.enum(['sop', 'system_documentation']),
  is_draft: z.boolean().default(true)
});

interface DocumentFormProps {
  onSubmit: (data: z.infer<typeof formSchema>, file: File, roles: UserRole[]) => void;
  initialData?: Document;
  isLoading?: boolean;
  initialRoles?: string[];
}

const roles: { label: string, value: UserRole }[] = [
  { label: 'Super Admin', value: 'super_admin' },
  { label: 'Office Manager', value: 'office_manager' },
  { label: 'Phlebotomist', value: 'phlebotomist' },
  { label: 'Concierge Doctor', value: 'concierge_doctor' },
  { label: 'Patient', value: 'patient' }
];

const DocumentForm: React.FC<DocumentFormProps> = ({ 
  onSubmit, 
  initialData, 
  isLoading = false,
  initialRoles = []
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>(initialRoles as UserRole[]);
  const { data: categories = [], isLoading: isCategoriesLoading } = useDocumentCategories();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: initialData?.title || '',
      description: initialData?.description || '',
      category_id: initialData?.category_id || '',
      document_type: initialData?.document_type || 'sop',
      is_draft: initialData?.is_draft ?? true
    }
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        title: initialData.title,
        description: initialData.description || '',
        category_id: initialData.category_id,
        document_type: initialData.document_type,
        is_draft: initialData.is_draft
      });
    }
  }, [initialData, form]);

  const handleFileChange = (selectedFile: File) => {
    setFile(selectedFile);
  };

  const handleSubmit = (data: z.infer<typeof formSchema>) => {
    if (!file && !initialData) {
      alert('Please upload a document file');
      return;
    }

    if (selectedRoles.length === 0) {
      alert('Please select at least one role that can access this document');
      return;
    }

    onSubmit(data, file as File, selectedRoles);
  };

  const toggleRole = (role: UserRole) => {
    setSelectedRoles(prev => 
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Document Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter document title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Enter document description" 
                      className="resize-none h-32"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                    disabled={isCategoriesLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="document_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Document Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="sop">Standard Operating Procedure (SOP)</SelectItem>
                      <SelectItem value="system_documentation">System Documentation</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_draft"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 mt-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer">Save as Draft</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Draft documents are only visible to administrators
                    </p>
                  </div>
                </FormItem>
              )}
            />
          </div>
          
          <div className="space-y-6">
            <DocumentUploader 
              onFileChange={handleFileChange}
              isLoading={isLoading}
            />

            <div>
              <FormLabel>Who can access this document?</FormLabel>
              <div className="mt-2 space-y-2 border rounded-md p-4">
                {roles.map((role) => (
                  <div key={role.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`role-${role.value}`}
                      checked={selectedRoles.includes(role.value)}
                      onCheckedChange={() => toggleRole(role.value)}
                    />
                    <label
                      htmlFor={`role-${role.value}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {role.label}
                    </label>
                  </div>
                ))}
              </div>
              {selectedRoles.length === 0 && (
                <p className="text-sm text-red-500 mt-1">
                  Please select at least one role
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : initialData ? 'Update Document' : 'Create Document'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default DocumentForm;
