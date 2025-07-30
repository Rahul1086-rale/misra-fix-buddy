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
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { v4 as uuidv4 } from 'uuid';
import ViolationsModal from './ViolationsModal';

export default function WorkflowControls() {
  const { state, dispatch } = useAppContext();
  const { toast } = useToast();
  const [showViolationsModal, setShowViolationsModal] = useState(false);

  const addLineNumbers = async () => {
    if (!state.uploadedFile || !state.projectId) return;
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await apiClient.addLineNumbers(state.projectId);
      
      if (response.success && response.data) {
        dispatch({ type: 'SET_NUMBERED_FILE', payload: { 
          name: `numbered_${state.uploadedFile.name}`, 
          path: response.data.numberedFilePath 
        }});
        dispatch({ type: 'SET_CURRENT_STEP', payload: 'numbering' });
        toast({ title: "Success", description: "Line numbers added successfully" });
      } else {
        throw new Error(response.error || 'Failed to add line numbers');
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : 'Failed to add line numbers',
        variant: "destructive" 
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const sendFirstPrompt = async () => {
    if (!state.numberedFile || !state.projectId) return;
    try {
      dispatch({ type: 'SET_PROCESSING', payload: true });
      const response = await apiClient.sendFirstPrompt(state.projectId);
      
      if (response.success && response.data) {
        const message = { 
          id: uuidv4(), 
          type: 'assistant' as const, 
          content: response.data.response, 
          timestamp: new Date() 
        };
        dispatch({ type: 'ADD_MESSAGE', payload: message });
        dispatch({ type: 'SET_CURRENT_STEP', payload: 'chat' });
        toast({ title: "Success", description: "Chat session initialized with Gemini" });
      } else {
        throw new Error(response.error || 'Failed to initialize chat');
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : 'Failed to initialize chat',
        variant: "destructive" 
      });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const fixViolations = async () => {
    if (!state.projectId || state.selectedViolations.length === 0) return;
    try {
      dispatch({ type: 'SET_PROCESSING', payload: true });
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
        toast({ title: "Success", description: "Violations fixed by Gemini" });
      } else {
        throw new Error(response.error || 'Failed to fix violations');
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : 'Failed to fix violations',
        variant: "destructive" 
      });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const applyFixes = async () => {
    if (!state.projectId) return;
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await apiClient.applyFixes(state.projectId);
      
      if (response.success && response.data) {
        dispatch({ type: 'SET_CURRENT_STEP', payload: 'finalize' });
        toast({ title: "Success", description: "Fixes applied to code successfully" });
      } else {
        throw new Error(response.error || 'Failed to apply fixes');
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : 'Failed to apply fixes',
        variant: "destructive" 
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const downloadFixedFile = async () => {
    if (!state.projectId) return;
    try {
      const blob = await apiClient.downloadFixedFile(state.projectId);
      
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow Controls</CardTitle>
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
              disabled={selectedCount === 0 || state.isProcessing}
            >
              <Wrench className="w-4 h-4 mr-2" />
              {state.isProcessing ? 'Fixing...' : 'Fix Selected'}
            </Button>
          </div>
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
          <Button onClick={() => dispatch({ type: 'RESET_STATE' })} variant="ghost" className="w-full">
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
  );
}