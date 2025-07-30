import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Download, Eye, Code2, Check, X as XIcon, 
  ChevronRight, ChevronLeft, SkipForward, Play 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ReviewData } from '@/lib/api';

interface FixReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FixReviewModal({ isOpen, onClose }: FixReviewModalProps) {
  const { state, dispatch } = useAppContext();
  const { toast } = useToast();
  
  // State for diff data
  const [originalCode, setOriginalCode] = useState<string>('');
  const [fixedCode, setFixedCode] = useState<string>('');
  const [highlightData, setHighlightData] = useState<{
    line_mappings: Record<number, number>;
    changed_lines: number[];
    changed_lines_fixed: number[];
    added_lines: number[];
    removed_lines: number[];
  } | null>(null);
  
  // State for review functionality
  const [reviewData, setReviewData] = useState<ReviewData>({
    pending_changes: [],
    accepted_changes: [],
    rejected_changes: [],
    current_line: null,
    total_changes: 0,
    reviewed_count: 0
  });
  
  const [currentLineKey, setCurrentLineKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  
  const originalScrollRef = useRef<HTMLDivElement>(null);
  const fixedScrollRef = useRef<HTMLDivElement>(null);

  // Load code content when modal opens
  useEffect(() => {
    if (isOpen && state.projectId) {
      loadCodeContent();
    }
  }, [isOpen, state.projectId]);

  const loadCodeContent = async () => {
    if (!state.projectId) return;
    
    setIsLoading(true);
    try {
      const diffResult = await apiClient.getDiff(state.projectId);

      if (diffResult.success && diffResult.data) {
        setOriginalCode(diffResult.data.original);
        setFixedCode(diffResult.data.fixed);
        setHighlightData(diffResult.data.highlight || null);
        setReviewData(diffResult.data.review_data);
        setSessionId(diffResult.data.session_id);
        setCurrentLineKey(diffResult.data.review_data.current_line);
      } else {
        throw new Error(diffResult.error || 'Failed to get diff data');
      }
    } catch (error) {
      console.error('Failed to load code content:', error);
      toast({
        title: "Error",
        description: "Failed to load code content",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptChange = async (lineKey?: string) => {
    const targetLineKey = lineKey || currentLineKey;
    if (!targetLineKey || !state.projectId) return;
    
    setIsLoading(true);
    try {
      const result = await apiClient.acceptChange(state.projectId, targetLineKey);
      
      if (result.success && result.data) {
        setReviewData(result.data.review_data);
        setCurrentLineKey(result.data.next_line);
        
        toast({
          title: "Change Accepted",
          description: result.data.message,
        });
        
        // Reload diff to show updated changes
        await loadCodeContent();
      } else {
        throw new Error(result.error || 'Failed to accept change');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to accept change',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRejectChange = async (lineKey?: string) => {
    const targetLineKey = lineKey || currentLineKey;
    if (!targetLineKey || !state.projectId) return;
    
    setIsLoading(true);
    try {
      const result = await apiClient.rejectChange(state.projectId, targetLineKey);
      
      if (result.success && result.data) {
        setReviewData(result.data.review_data);
        setCurrentLineKey(result.data.next_line);
        
        toast({
          title: "Change Rejected",
          description: result.data.message,
        });
        
        // Reload diff to show updated changes
        await loadCodeContent();
      } else {
        throw new Error(result.error || 'Failed to reject change');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to reject change',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavigate = async (direction: 'next' | 'prev') => {
    if (!state.projectId) return;
    
    setIsLoading(true);
    try {
      const result = direction === 'next' 
        ? await apiClient.navigateToNext(state.projectId, currentLineKey || undefined)
        : await apiClient.navigateToPrev(state.projectId, currentLineKey || undefined);
      
      if (result.success && result.data) {
        setReviewData(result.data.review_data);
        setCurrentLineKey(result.data.next_line);
        
        if (result.data.next_line) {
          scrollToLine(result.data.next_line);
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to navigate',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToLine = (lineKey: string) => {
    // Implement line scrolling logic based on line key
    const lineNum = parseInt(lineKey.replace(/[a-z]/g, ''));
    
    if (originalScrollRef.current && fixedScrollRef.current) {
      const lineHeight = 20; // Approximate line height
      const scrollTop = (lineNum - 1) * lineHeight;
      
      originalScrollRef.current.scrollTop = scrollTop;
      fixedScrollRef.current.scrollTop = scrollTop;
    }
  };

  const downloadFinalFile = async () => {
    if (!state.projectId) return;
    
    try {
      setIsLoading(true);
      
      // Apply only accepted fixes
      const mergeResponse = await apiClient.applyAcceptedFixes(state.projectId);
      
      if (mergeResponse.success) {
        // Download the final file
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
          
          dispatch({ type: 'SET_CURRENT_STEP', payload: 'finalize' });
          toast({ 
            title: "Success", 
            description: "Fixed file with accepted changes downloaded successfully" 
          });
          onClose();
        } else {
          throw new Error('Failed to download file');
        }
      } else {
        throw new Error(mergeResponse.error || 'Failed to apply accepted fixes');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to download file',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Enhanced highlight differences with better line key matching
  const highlightDifferences = (code: string, isOriginal: boolean) => {
    if (!originalCode || !fixedCode || !highlightData) return code;
    
    const codeLines = code.split('\n');
    const changedLines = new Set<number>();
    const addedLines = new Set<number>();
    
    if (isOriginal) {
      highlightData.changed_lines?.forEach(lineNum => {
        changedLines.add(lineNum - 1);
      });
    } else {
      highlightData.changed_lines_fixed?.forEach(lineNum => {
        changedLines.add(lineNum - 1);
      });
      highlightData.added_lines?.forEach(lineNum => {
        addedLines.add(lineNum - 1);
      });
    }
    
    return codeLines.map((line, index) => {
      let className = '';
      let statusBadge = null;
      let actionButtons = null;
      
      // For fixed code view, determine review status and actions
      if (!isOriginal) {
        // Get line number (1-based)
        const lineNumber = index + 1;
        
        // Find matching line key from all changes
        const allChanges = [...(reviewData.pending_changes || []), ...(reviewData.accepted_changes || []), ...(reviewData.rejected_changes || [])];
        
        // Match line key based on line number
        const matchingLineKey = allChanges.find(key => {
          const baseLineNum = parseInt(key.replace(/[a-z]/g, ''));
          
          if (key.includes('a')) {
            // For added lines (e.g., "5a"), check if this is an added line at the right position
            return addedLines.has(index) && Math.abs(baseLineNum - lineNumber) <= 2;
          } else {
            // For modified lines, check if this is a changed line
            return changedLines.has(index) && Math.abs(baseLineNum - lineNumber) <= 2;
          }
        });
        
        if (matchingLineKey) {
          const isAccepted = reviewData.accepted_changes?.includes(matchingLineKey);
          const isRejected = reviewData.rejected_changes?.includes(matchingLineKey);
          const isPending = reviewData.pending_changes?.includes(matchingLineKey);
          const isCurrent = currentLineKey === matchingLineKey;
          
          // Only show review options for changed or added lines
          const isReviewableLine = addedLines.has(index) || changedLines.has(index);
          
          if (isReviewableLine) {
            if (isAccepted) {
              className = 'bg-green-50 border-l-4 border-l-green-500 dark:bg-green-950/20 dark:border-l-green-400';
              statusBadge = <Badge variant="default" className="ml-2 text-xs bg-green-100 text-green-800">✓ Accepted</Badge>;
            } else if (isRejected) {
              className = 'bg-red-50 border-l-4 border-l-red-500 dark:bg-red-950/20 dark:border-l-red-400';
              statusBadge = <Badge variant="destructive" className="ml-2 text-xs">✗ Rejected</Badge>;
            } else {
              // Show as pending (default state for all changes)
              className = 'bg-yellow-50 border-l-4 border-l-yellow-500 dark:bg-yellow-950/20 dark:border-l-yellow-400';
              statusBadge = <Badge variant="secondary" className="ml-2 text-xs bg-yellow-100 text-yellow-800">⏳ Pending</Badge>;
              
              // Show accept/reject buttons for pending changes
              actionButtons = (
                <div className="flex gap-1 ml-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs bg-green-50 hover:bg-green-100 border-green-300 text-green-700"
                    onClick={() => handleAcceptChange(matchingLineKey)}
                    disabled={isLoading}
                  >
                    ✓
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs bg-red-50 hover:bg-red-100 border-red-300 text-red-700"
                    onClick={() => handleRejectChange(matchingLineKey)}
                    disabled={isLoading}
                  >
                    ✗
                  </Button>
                </div>
              );
            }
            
            if (isCurrent) {
              className += ' ring-2 ring-blue-500';
            }
          }
        }
      } else {
        // Original code - highlight changed lines
        if (changedLines.has(index)) {
          className = 'bg-blue-50 border-l-4 border-l-blue-500 dark:bg-blue-950/20 dark:border-l-blue-400';
        }
      }
      
      return (
        <div key={index} className={`${className} px-3 py-1 flex items-center justify-between hover:bg-muted/30 min-h-[24px]`}>
          <span className="font-mono text-sm flex-1">{line || ' '}</span>
          <div className="flex items-center shrink-0">
            {statusBadge}
            {actionButtons}
          </div>
        </div>
      );
    });
  };

  const renderCodeBlock = (code: string, title: string, isOriginal?: boolean) => (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 p-3 border-b bg-muted">
        <Code2 className="w-4 h-4" />
        <span className="font-medium text-sm">{title}</span>
      </div>
      <div 
        ref={isOriginal ? originalScrollRef : fixedScrollRef}
        className="overflow-auto h-[500px]"
      >
        <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-6">
          <code className="block">
            {code ? (
              isOriginal !== undefined ? (
                <div className="space-y-0">
                  {highlightDifferences(code, isOriginal)}
                </div>
              ) : (
                code
              )
            ) : (
              'Loading...'
            )}
          </code>
        </pre>
      </div>
    </div>
  );

  const progress = reviewData.total_changes > 0 
    ? (reviewData.reviewed_count / reviewData.total_changes) * 100 
    : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Code Fix Review - Accept/Reject Changes
          </DialogTitle>
          
          {/* Review Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Review Progress</span>
              <span>{reviewData.reviewed_count} / {reviewData.total_changes} changes reviewed</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Review Controls */}
          {currentLine
