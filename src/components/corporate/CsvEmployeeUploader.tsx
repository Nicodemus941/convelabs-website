import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileUp, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CsvUploadJob {
  id: string;
  file_name: string;
  status: 'processing' | 'completed' | 'failed';
  total_rows: number;
  processed_rows: number;
  successful_rows: number;
  failed_rows: number;
  error_details: any[];
  created_at: string;
  completed_at: string | null;
}

interface CsvEmployeeUploaderProps {
  onUploadComplete: () => void;
}

const CsvEmployeeUploader: React.FC<CsvEmployeeUploaderProps> = ({ onUploadComplete }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadJobs, setUploadJobs] = useState<CsvUploadJob[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const template = 'email,first_name,last_name,executive_upgrade\nemployee1@company.com,John,Doe,false\nemployee2@company.com,Jane,Smith,true';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line, index) => {
      const values = line.split(',').map(v => v.trim());
      const row: any = { row_number: index + 2 };
      headers.forEach((header, i) => {
        row[header] = values[i] || '';
      });
      return row;
    });
    
    return rows;
  };

  const validateCSV = (data: any[]): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const requiredFields = ['email', 'first_name', 'last_name'];
    
    if (data.length === 0) {
      errors.push('CSV file is empty');
      return { valid: false, errors };
    }

    // Check for required headers
    const firstRow = data[0];
    requiredFields.forEach(field => {
      if (!(field in firstRow)) {
        errors.push(`Missing required column: ${field}`);
      }
    });

    // Validate each row
    data.forEach((row, index) => {
      if (!row.email || !row.email.includes('@')) {
        errors.push(`Row ${row.row_number}: Invalid email address`);
      }
      if (!row.first_name) {
        errors.push(`Row ${row.row_number}: Missing first name`);
      }
      if (!row.last_name) {
        errors.push(`Row ${row.row_number}: Missing last name`);
      }
    });

    return { valid: errors.length === 0, errors };
  };

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }

    try {
      const text = await file.text();
      const data = parseCSV(text);
      setPreview(data.slice(0, 5)); // Show first 5 rows for preview
      
      const validation = validateCSV(data);
      if (!validation.valid) {
        toast.error(`CSV validation failed: ${validation.errors.join(', ')}`);
      }
    } catch (error) {
      toast.error('Failed to parse CSV file');
      console.error(error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const uploadCSV = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const text = await selectedFile.text();
      const data = parseCSV(text);
      const validation = validateCSV(data);
      
      if (!validation.valid) {
        toast.error('Please fix CSV validation errors before uploading');
        setUploading(false);
        return;
      }

      // Upload file to storage
      const fileName = `${Date.now()}_${selectedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('corporate-uploads')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Process CSV via edge function
      const { data: processData, error: processError } = await supabase.functions
        .invoke('process-csv-employees', {
          body: { filePath: uploadData.path, fileName: selectedFile.name }
        });

      if (processError) throw processError;

      toast.success('CSV upload started successfully');
      setSelectedFile(null);
      setPreview([]);
      loadUploadJobs();
      onUploadComplete();
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload CSV');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const loadUploadJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('csv_upload_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setUploadJobs((data as CsvUploadJob[]) || []);
    } catch (error) {
      console.error('Failed to load upload jobs:', error);
    }
  };

  React.useEffect(() => {
    loadUploadJobs();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Bulk Employee Upload
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>CSV File</Label>
              <div
                className="mt-1 border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 cursor-pointer flex flex-col items-center justify-center hover:border-muted-foreground/40 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".csv"
                  onChange={handleFileChange}
                />
                {selectedFile ? (
                  <div className="text-center">
                    <FileUp className="h-8 w-8 text-primary mx-auto mb-2" />
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium">Drop CSV file here or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Required columns: email, first_name, last_name, executive_upgrade
                    </p>
                  </div>
                )}
              </div>
            </div>

            {preview.length > 0 && (
              <div>
                <Label>Preview (First 5 rows)</Label>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm border rounded">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-left">Email</th>
                        <th className="p-2 text-left">First Name</th>
                        <th className="p-2 text-left">Last Name</th>
                        <th className="p-2 text-left">Executive</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, index) => (
                        <tr key={index} className="border-b">
                          <td className="p-2">{row.email}</td>
                          <td className="p-2">{row.first_name}</td>
                          <td className="p-2">{row.last_name}</td>
                          <td className="p-2">{row.executive_upgrade || 'false'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Button 
              onClick={uploadCSV} 
              disabled={!selectedFile || uploading}
              className="w-full"
            >
              {uploading ? 'Uploading...' : 'Upload Employees'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {uploadJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {uploadJobs.map((job) => (
                <div key={job.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {job.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {job.status === 'failed' && <AlertCircle className="h-4 w-4 text-red-500" />}
                      {job.status === 'processing' && <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                      <span className="font-medium">{job.file_name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground capitalize">{job.status}</span>
                  </div>
                  
                  {job.status === 'processing' && job.total_rows > 0 && (
                    <div className="space-y-2">
                      <Progress value={(job.processed_rows / job.total_rows) * 100} />
                      <p className="text-sm text-muted-foreground">
                        {job.processed_rows} of {job.total_rows} rows processed
                      </p>
                    </div>
                  )}
                  
                  {job.status === 'completed' && (
                    <div className="text-sm text-muted-foreground">
                      Successfully processed {job.successful_rows} employees
                      {job.failed_rows > 0 && `, ${job.failed_rows} failed`}
                    </div>
                  )}
                  
                  {job.status === 'failed' && job.error_details?.length > 0 && (
                    <Alert className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {job.error_details.slice(0, 3).map((error: any, i: number) => (
                          <div key={i}>{error.message || error}</div>
                        ))}
                        {job.error_details.length > 3 && (
                          <div>... and {job.error_details.length - 3} more errors</div>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CsvEmployeeUploader;