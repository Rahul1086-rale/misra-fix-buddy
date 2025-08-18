import React, { useState } from 'react';
import { 
  Hash, 
  MessageSquare, 
  Wrench, 
  Download, 
  RefreshCw, 
  CheckCircle,
  Merge,
  FileX,
  List
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConcurrentAppContext } from '@/context/ConcurrentAppContext';
import { useToast } from '@/hooks/use-toast';
import { concurrentApiClient } from '@/lib/concurrent-api';
import { getAuthenticatedUsername } from '@/lib/auth-utils';
import { v4 as uuidv4 } from 'uuid';
import ViolationsModal from './ViolationsModal';
import RequestStatusMonitor from './RequestStatusMonitor';

export default function ConcurrentWorkflowControls() {
  const { state, dispatch, startRequest, updateRequest, completeRequest, errorRequest } = useConcurrentAppContext();
  const { toast } = useToast();
  const [showViolationsModal, setShowViolationsModal] = useState(false);

  const addLineNumbers = async () => {
    if (!state.uploadedFile || !state.projectId) return;
    
    const requestId = startRequest('upload', state.projectId);
    
    try {
      updateRequest(requestId, { status: 'processing' });
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const response = await concurrentApiClient.addLineNumbers(state.projectId);
      
      if (response.success && response.data && typeof response.data === 'object' && response.data !== null) {
        const data = response.data as { numberedFilePath?: string };
        if (data.numberedFilePath) {
          dispatch({ type: 'SET_NUMBERED_FILE', payload: { 
            name: `numbered_${state.uploadedFile.name}`, 
            path: data.numberedFilePath 
          }});
          dispatch({ type: 'SET_CURRENT_STEP', payload: 'numbering' });
          toast({ title: "Success", description: "Line numbers added successfully" });
          completeRequest(requestId);
        } else {
          throw new Error('Invalid response: missing numberedFilePath');
        }
      } else {
        throw new Error(response.error || 'Failed to add line numbers');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add line numbers';
      errorRequest(requestId, errorMessage);
      toast({ 
        title: "Error", 
        description: errorMessage,
        variant: "destructive" 
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const sendFirstPrompt = async () => {
    if (!state.numberedFile || !state.projectId) return;
    
    const requestId = startRequest('chat', state.projectId);
    
    try {
      updateRequest(requestId, { status: 'processing' });
      dispatch({ type: 'SET_PROCESSING', payload: true });
      
      const response = await concurrentApiClient.sendFirstPrompt(state.projectId, getAuthenticatedUsername());
      
      if (response.success && response.data && typeof response.data === 'object' && response.data !== null) {
        const data = response.data as { response?: string };
        if (data.response) {
          const message = { 
            id: uuidv4(), 
            type: 'assistant' as const, 
            content: data.response, 
            timestamp: new Date() 
          };
          dispatch({ type: 'ADD_MESSAGE', payload: message });
          dispatch({ type: 'SET_CURRENT_STEP', payload: 'chat' });
          toast({ title: "Success", description: "Chat session initialized with Gemini" });
          completeRequest(requestId);
        } else {
          throw new Error('Invalid response: missing response content');
        }
      } else {
        throw new Error(response.error || 'Failed to initialize chat');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize chat';
      errorRequest(requestId, errorMessage);
      toast({ 
        title: "Error", 
        description: errorMessage,
        variant: "destructive" 
      });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const fixViolations = async () => {
    if (!state.projectId || state.selectedViolations.length === 0) return;
    
    const requestId = startRequest('fix-violations', state.projectId);
    
    try {
      updateRequest(requestId, { status: 'processing', progress: 25 });
      dispatch({ type: 'SET_PROCESSING', payload: true });
      
      console.log(`Starting concurrent violation fix for project ${state.projectId}`);
      
      const response = await concurrentApiClient.fixViolations(state.projectId, getAuthenticatedUsername(), state.selectedViolations);
      
      updateRequest(requestId, { progress: 75 });
      
      if (response.success && response.data && typeof response.data === 'object' && response.data !== null) {
        const data = response.data as { response?: string };
        if (data.response) {
          const message = { 
            id: uuidv4(), 
            type: 'assistant' as const, 
            content: data.response, 
            timestamp: new Date() 
          };
          dispatch({ type: 'ADD_MESSAGE', payload: message });
          dispatch({ type: 'SET_CURRENT_STEP', payload: 'fixing' });
          toast({ title: "Success", description: "Violations fixed by Gemini" });
          completeRequest(requestId);
        } else {
          throw new Error('Invalid response: missing response content');
        }
      } else {
        throw new Error(response.error || 'Failed to fix violations');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fix violations';
      errorRequest(requestId, errorMessage);
      toast({ 
        title: "Error", 
        description: errorMessage,
        variant: "destructive" 
      });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const applyFixes = async () => {
    if (!state.projectId) return;
    
    const requestId = startRequest('apply-fixes', state.projectId);
    
    try {
      updateRequest(requestId, { status: 'processing' });
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const response = await concurrentApiClient.applyFixes(state.projectId);
      
      if (response.success && response.data) {
        dispatch({ type: 'SET_CURRENT_STEP', payload: 'finalize' });
        toast({ title: "Success", description: "Fixes applied to code successfully" });
        completeRequest(requestId);
      } else {
        throw new Error(response.error || 'Failed to apply fixes');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to apply fixes';
      errorRequest(requestId, errorMessage);
      toast({ 
        title: "Error", 
        description: errorMessage,
        variant: "destructive" 
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const downloadFixedFile = async () => {
    if (!state.projectId) return;
    try {
      const blob = await concurrentApiClient.downloadFixedFile(state.projectId);
      
      if (blob) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `fixed_${state.uploadedFile?.name || 'file.cpp'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({ title: "Success", description: "Fixed file downloaded successfully" });
      } else {
        throw new Error('Failed to download file');
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : 'Failed to download file',
        variant: "destructive" 
      });
    }
  };

  const selectedCount = state.violations.filter(v => v.selected).length;
  const isProcessingViolations = state.activeRequests.some(req => 
    req.type === 'fix-violations' && (req.status === 'pending' || req.status === 'processing')
  );

  return (
    <div className="space-y-4">
      <RequestStatusMonitor />
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Concurrent Workflow Controls
            <Badge variant="outline" className="text-xs">
              {state.queueStatus.active}/{state.queueStatus.maxConcurrent} Active
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium">1. Add Line Numbers</span>
            <Button 
              onClick={addLineNumbers} 
              variant="outline" 
              className="w-full" 
              disabled={!state.uploadedFile || state.isLoading}
            >
              <Hash className="w-4 h-4 mr-2" />
              {state.isLoading ? 'Processing...' : 'Add Line Numbers'}
            </Button>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">2. Start Chat</span>
            <Button 
              onClick={sendFirstPrompt} 
              variant="outline" 
              className="w-full" 
              disabled={!state.numberedFile || state.isProcessing}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              {state.isProcessing ? 'Initializing...' : 'Start Chat with Gemini'}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">3. Select & Fix Violations</span>
              <Badge variant="outline">{selectedCount} selected</Badge>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowViolationsModal(true)} 
                variant="outline" 
                className="flex-1" 
                disabled={state.violations.length === 0}
              >
                <List className="w-4 h-4 mr-2" />
                View Violations
              </Button>
              <Button 
                onClick={fixViolations} 
                variant="outline" 
                className="flex-1" 
                disabled={selectedCount === 0 || isProcessingViolations}
              >
                <Wrench className="w-4 h-4 mr-2" />
                {isProcessingViolations ? 'Processing...' : 'Fix Selected'}
              </Button>
            </div>
            
            {isProcessingViolations && (
              <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                Multiple violations can be processed concurrently without blocking other users
              </div>
            )}
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">4. Apply Fixes</span>
            <Button 
              onClick={applyFixes} 
              variant="outline" 
              className="w-full" 
              disabled={state.currentStep !== 'fixing' || state.isLoading}
            >
              <Merge className="w-4 h-4 mr-2" />
              {state.isLoading ? 'Applying...' : 'Merge Fixes'}
            </Button>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">5. Download</span>
            <Button 
              onClick={downloadFixedFile} 
              variant="default" 
              className="w-full" 
              disabled={state.currentStep !== 'finalize'}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Fixed File
            </Button>
          </div>

          <div className="pt-4 border-t">
            <Button 
              onClick={() => {
                concurrentApiClient.cancelAllRequests();
                dispatch({ type: 'RESET_STATE' });
              }} 
              variant="ghost" 
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Start New Session
            </Button>
          </div>
        </CardContent>
        
        <ViolationsModal 
          isOpen={showViolationsModal} 
          onClose={() => setShowViolationsModal(false)} 
        />
      </Card>
    </div>
  );
}
