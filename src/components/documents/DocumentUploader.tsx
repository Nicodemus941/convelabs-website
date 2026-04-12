
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileUp } from 'lucide-react';

interface DocumentUploaderProps {
  onFileChange: (file: File) => void;
  label?: string;
  accept?: string;
  isLoading?: boolean;
}

const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  onFileChange,
  label = "Upload Document",
  accept = ".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt",
  isLoading = false
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      onFileChange(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      onFileChange(file);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <Label>{label}</Label>
      <div
        className="mt-1 border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer flex flex-col items-center justify-center"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleButtonClick}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
          accept={accept}
        />
        {selectedFile ? (
          <div className="text-center">
            <FileUp className="h-8 w-8 text-conve-gold mx-auto mb-2" />
            <p className="text-sm font-medium">{selectedFile.name}</p>
            <p className="text-xs text-gray-500 mt-1">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
        ) : (
          <div className="text-center">
            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium">Drag and drop a file, or click to browse</p>
            <p className="text-xs text-gray-500 mt-1">
              Accepted file types: PDF, Word, Excel, PowerPoint, Text
            </p>
          </div>
        )}
      </div>
      {selectedFile && (
        <Button 
          variant="outline" 
          className="mt-2"
          onClick={handleButtonClick}
          disabled={isLoading}
        >
          Replace File
        </Button>
      )}
    </div>
  );
};

export default DocumentUploader;
