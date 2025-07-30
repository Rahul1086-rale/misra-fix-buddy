import React, { useRef } from 'react';
import { Upload, FileText, Table } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';

export default function FileUploadSection() {
  const { state, dispatch } = useAppContext();
  const { toast } = useToast();
  const cppFileRef = useRef<HTMLInputElement>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);

  const handleCppUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.cpp') && !file.name.endsWith('.c')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a .cpp or .c file",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    
    // Generate project ID if not exists
    const projectId = state.projectId || uuidv4();
    if (!state.projectId) {
      dispatch({ type: 'SET_PROJECT_ID', payload: projectId });
    }
    
    formData.append('projectId', projectId);

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const response = await fetch('/api/upload/cpp-file', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        dispatch({ 
          type: 'SET_UPLOADED_FILE', 
          payload: { name: file.name, path: data.filePath }
        });
        
        toast({
          title: "Success",
          description: "C++ file uploaded and numbered successfully",
        });
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Error",
        description: "Failed to upload C++ file",
        variant: "destructive",
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      if (cppFileRef.current) {
        cppFileRef.current.value = '';
      }
    }
  };

  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
      return;
    }

    if (!state.projectId) {
      toast({
        title: "No project",
        description: "Please upload a C++ file first",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', state.projectId);
    formData.append('targetFile', state.uploadedFile?.name || '');

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const response = await fetch('/api/upload/misra-report', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const violations = await response.json();
        dispatch({ type: 'SET_VIOLATIONS', payload: violations });
        
        toast({
          title: "Success",
          description: `MISRA report uploaded. Found ${violations.length} violations`,
        });
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Error",
        description: "Failed to upload MISRA report",
        variant: "destructive",
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      if (excelFileRef.current) {
        excelFileRef.current.value = '';
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>File Upload</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* C++ File Upload */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Source File</span>
            {state.uploadedFile && (
              <Badge variant="secondary" className="text-xs">
                <FileText className="w-3 h-3 mr-1" />
                {state.uploadedFile.name}
              </Badge>
            )}
          </div>
          <input
            ref={cppFileRef}
            type="file"
            accept=".cpp,.c"
            onChange={handleCppUpload}
            className="hidden"
          />
          <Button
            onClick={() => cppFileRef.current?.click()}
            variant="outline"
            className="w-full"
            disabled={state.isLoading}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload C++ File
          </Button>
        </div>

        {/* Excel Report Upload */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">MISRA Report</span>
            {state.violations.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Table className="w-3 h-3 mr-1" />
                {state.violations.length} violations
              </Badge>
            )}
          </div>
          <input
            ref={excelFileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelUpload}
            className="hidden"
          />
          <Button
            onClick={() => excelFileRef.current?.click()}
            variant="outline"
            className="w-full"
            disabled={state.isLoading || !state.uploadedFile}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload MISRA Report
          </Button>
        </div>

        {/* Status */}
        <div className="pt-2 border-t">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                state.uploadedFile ? 'bg-green-500' : 'bg-gray-300'
              }`} />
              <span>C++ File</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                state.violations.length > 0 ? 'bg-green-500' : 'bg-gray-300'
              }`} />
              <span>MISRA Report</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}