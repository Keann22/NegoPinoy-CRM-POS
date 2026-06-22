'use client';

import { Upload, X } from 'lucide-react';
import React from 'react';
import { Button } from './button';
import { ZoomableImage } from './zoomable-image';
import { Input } from './input';
import { Label } from './label';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  value: File[];
  onChange: (files: File[]) => void;
  className?: string;
  multiple?: boolean;
}

export function FileUpload({ value, onChange, className, multiple = false }: FileUploadProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (multiple) {
        onChange([...(value || []), ...newFiles]);
      } else {
        onChange(newFiles.slice(0, 1));
      }
    }
  };

  const removeFile = (fileToRemove: File) => {
    onChange(value.filter((file) => file !== fileToRemove));
  };

  return (
    <div className={cn("space-y-4", className)}>
        <Label htmlFor="file-upload" className="flex items-center justify-center w-full h-32 px-4 transition bg-background border-2 border-dashed rounded-md appearance-none cursor-pointer hover:border-gray-400 focus:outline-none">
            <span className="flex items-center space-x-2">
                <Upload className="w-6 h-6 text-muted-foreground" />
                <span className="font-medium text-muted-foreground">
                    Click to upload or drag and drop
                </span>
            </span>
            <Input id="file-upload" type="file" multiple={multiple} className="hidden" onChange={handleFileChange} accept="image/*" />
        </Label>
        
        {value?.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {value.map((file, i) => {
            const objectUrl = URL.createObjectURL(file);
            return (
                <div key={i} className="relative aspect-square rounded-md overflow-hidden">
                <ZoomableImage
                    src={objectUrl}
                    alt={file.name}
                    fill
                    className="object-cover rounded-md"
                    onLoad={() => URL.revokeObjectURL(objectUrl)}
                />
                <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={() => removeFile(file)}
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Remove file</span>
                </Button>
                </div>
            )
          })}
        </div>
      )}
    </div>
  );
}
