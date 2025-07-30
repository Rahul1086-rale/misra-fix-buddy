import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, Code, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  content?: any;
}

interface MisraUploadProps {
  onExcelUpload: (file: File) => void;
  onCodeUpload: (file: File) => void;
  excelFile?: UploadedFile;
  codeFile?: UploadedFile;
}

export const MisraUpload = ({ onExcelUpload, onCodeUpload, excelFile, codeFile }: MisraUploadProps) => {
  const onExcelDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onExcelUpload(acceptedFiles[0]);
    }
  }, [onExcelUpload]);

  const onCodeDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onCodeUpload(acceptedFiles[0]);
    }
  }, [onCodeUpload]);

  const {
    getRootProps: getExcelRootProps,
    getInputProps: getExcelInputProps,
    isDragActive: isExcelDragActive
  } = useDropzone({
    onDrop: onExcelDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false
  });

  const {
    getRootProps: getCodeRootProps,
    getInputProps: getCodeInputProps,
    isDragActive: isCodeDragActive
  } = useDropzone({
    onDrop: onCodeDrop,
    accept: {
      'text/x-c': ['.c'],
      'text/x-c++': ['.cpp', '.cxx', '.cc'],
      'text/x-c-header': ['.h'],
      'text/x-c++-header': ['.hpp', '.hxx']
    },
    multiple: false
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Excel Upload */}
      <Card className="p-6 bg-gradient-to-br from-card to-card/80 border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <FileSpreadsheet className="h-5 w-5 text-warning" />
          <h3 className="text-lg font-semibold">MISRA Violation Report</h3>
        </div>
        
        <div
          {...getExcelRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200",
            isExcelDragActive 
              ? "border-primary bg-primary/5" 
              : "border-border hover:border-primary/50 hover:bg-accent/30",
            excelFile && "border-success bg-success/5"
          )}
        >
          <input {...getExcelInputProps()} />
          {excelFile ? (
            <div className="space-y-3">
              <div className="w-12 h-12 mx-auto bg-success/20 rounded-lg flex items-center justify-center">
                <FileSpreadsheet className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="font-medium text-foreground">{excelFile.name}</p>
                <p className="text-sm text-muted-foreground">{formatFileSize(excelFile.size)}</p>
              </div>
              <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                Ready to analyze
              </Badge>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 mx-auto bg-accent rounded-lg flex items-center justify-center">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {isExcelDragActive ? "Drop Excel file here" : "Upload MISRA Report"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Drag & drop or click to select (.xlsx, .xls)
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Code Upload */}
      <Card className="p-6 bg-gradient-to-br from-card to-card/80 border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Code className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">C/C++ Source Code</h3>
        </div>
        
        <div
          {...getCodeRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200",
            isCodeDragActive 
              ? "border-primary bg-primary/5" 
              : "border-border hover:border-primary/50 hover:bg-accent/30",
            codeFile && "border-success bg-success/5"
          )}
        >
          <input {...getCodeInputProps()} />
          {codeFile ? (
            <div className="space-y-3">
              <div className="w-12 h-12 mx-auto bg-success/20 rounded-lg flex items-center justify-center">
                <Code className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="font-medium text-foreground">{codeFile.name}</p>
                <p className="text-sm text-muted-foreground">{formatFileSize(codeFile.size)}</p>
              </div>
              <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                Ready to fix
              </Badge>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 mx-auto bg-accent rounded-lg flex items-center justify-center">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {isCodeDragActive ? "Drop code file here" : "Upload Source Code"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Drag & drop or click to select (.c, .cpp, .h, .hpp)
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};