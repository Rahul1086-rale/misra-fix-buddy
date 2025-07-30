import React, { useState, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  Table, 
  AlertTriangle, 
  Wrench, 
  Eye, 
  MessageSquare,
  RefreshCw,
  CheckCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { v4 as uuidv4 } from 'uuid';
import ViolationsModalUpdated from './ViolationsModalUpdated';
import FixViewModal from './FixViewModal';
import ChatFeedbackModal from './ChatFeedbackModal';

export default function NewWorkflowPanel() {
  const { state, dispatch } = useAppContext();
  const { toast } = useToast();
  
  // Modal states
  const [showViolationsModal, setShowViolationsModal] = useState(false);
  const [showFixViewModal, setShowFixViewModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  
  // File input refs
  const cppFileRef = useRef<HTMLInputElement>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);
  
  // Loading states
  const [isUploadingCpp, setIsUploadingCpp] = useState(false);
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [isFixingViolations, setIsFixingViolations] = useState(false);

  // Upload C++ File with automatic numbering and chat initialization
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

    // Reset state for new session
    dispatch({ type: 'RESET_STATE' });
    
    setIsUploadingCpp(true);
    
    try {
      // Generate new project ID
      const projectId = uuidv4();
      dispatch({ type: 'SET_PROJECT_ID', payload: projectId });

      // Upload file
      const uploadResponse = await apiClient.uploadCppFile(file, projectId);
      
      if (uploadResponse.success && uploadResponse.data) {
        dispatch({ 
          type: 'SET_UPLOADED_FILE', 
          payload: { name: file.name, path: uploadResponse.data.filePath }
        });

        // Automatically add line numbers
        const numberResponse = await apiClient.addLineNumbers(projectId);
        
        if (numberResponse.success && numberResponse.data) {
          dispatch({ type: 'SET_NUMBERED_FILE', payload: { 
            name: `numbered_${file.name}`, 
            path: numberResponse.data.numberedFilePath 
          }});

          // Start chat session
          const chatResponse = await apiClient.sendFirstPrompt(projectId);
          
          if (chatResponse.success && chatResponse.data) {
            const message = { 
              id: uuidv4(), 
              type: 'assistant' as const, 
              content: chatResponse.data.response, 
              timestamp: new Date() 
            };
            dispatch({ type: 'ADD_MESSAGE', payload: message });
            dispatch({ type: 'SET_CURRENT_STEP', payload: 'chat' });
            
          toast({ 
            title: "Success", 
            description: "File uploaded successfully" 
          });
          } else {
            throw new Error(chatResponse.error || 'Failed to initialize chat');
          }
        } else {
          throw new Error(numberResponse.error || 'Failed to add line numbers');
        }
      } else {
        throw new Error(uploadResponse.error || 'Failed to upload file');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Upload process failed',
        variant: "destructive",
      });
    } finally {
      setIsUploadingCpp(false);
      if (cppFileRef.current) {
        cppFileRef.current.value = '';
      }
    }
  };

  // Upload MISRA Report
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

    if (!state.projectId || !state.uploadedFile) {
      toast({
        title: "No project",
        description: "Please upload a Source file first",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingExcel(true);

    try {
      const response = await apiClient.uploadMisraReport(
        file,
        state.projectId,
        state.uploadedFile.name
      );

      if (response.success && response.data) {
        dispatch({ type: 'SET_VIOLATIONS', payload: response.data });
        
        toast({
          title: "Success",
          description: `MISRA report uploaded. Found ${response.data.length} violations`,
        });
      } else {
        throw new Error(response.error || 'Failed to upload MISRA report');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to upload MISRA report',
        variant: "destructive",
      });
    } finally {
      setIsUploadingExcel(false);
      if (excelFileRef.current) {
        excelFileRef.current.value = '';
      }
    }
  };

  // Fix Selected Violations
  const fixSelectedViolations = async () => {
    if (!state.projectId || state.selectedViolations.length === 0) return;
    
    setIsFixingViolations(true);
    
    try {
      const response = await apiClient.fixViolations(state.projectId, state.selectedViolations);
      
      if (response.success && response.data) {
        const message = { 
          id: uuidv4(), 
          type: 'assistant' as const, 
          content: response.data.response, 
          timestamp: new Date() 
        };
        dispatch({ type: 'ADD_MESSAGE', payload: message });
        dispatch({ type: 'SET_CURRENT_STEP', payload: 'fixing' });
        
        toast({ 
          title: "Success", 
          description: "Violations fixed and temporary file created" 
        });
      } else {
        throw new Error(response.error || 'Failed to fix violations');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to fix violations',
        variant: "destructive",
      });
    } finally {
      setIsFixingViolations(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
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
              disabled={isUploadingCpp}
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploadingCpp ? 'Processing...' : 'Upload Source File'}
            </Button>
            {state.uploadedFile && (
              <div className="text-xs text-muted-foreground">
                ✓ File uploaded
              </div>
            )}
          </div>

          {/* MISRA Report Upload */}
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
              disabled={isUploadingExcel || !state.uploadedFile}
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploadingExcel ? 'Processing...' : 'Upload MISRA Report'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Violations Section */}
      {state.violations.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Button
                onClick={() => setShowViolationsModal(true)}
                variant="outline"
                className="w-full"
              >
                <Eye className="w-4 h-4 mr-2" />
                View and Select Violations
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fix Review Section */}
      {state.currentStep === 'fixing' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Fix Review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Fixes have been applied to {state.selectedViolations.length} violations.
              Review the changes before downloading.
            </div>

            <Button
              onClick={() => setShowFixViewModal(true)}
              variant="default"
              className="w-full"
            >
              <Eye className="w-4 h-4 mr-2" />
              View Fix & Download
            </Button>
          </CardContent>
        </Card>
      )}


      {/* Top Right Menu */}
      {state.projectId && (
        <div className="fixed top-6 right-6 z-50">
          <Button
            onClick={() => setShowChatModal(true)}
            variant="outline"
            size="sm"
            className="shadow-lg"
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Modals */}
      <ViolationsModalUpdated 
        isOpen={showViolationsModal} 
        onClose={() => setShowViolationsModal(false)}
        onFixComplete={() => setShowFixViewModal(true)}
      />
      
      <FixViewModal 
        isOpen={showFixViewModal} 
        onClose={() => setShowFixViewModal(false)} 
      />
      
      <ChatFeedbackModal 
        isOpen={showChatModal} 
        onClose={() => setShowChatModal(false)} 
      />
    </div>
  );
}