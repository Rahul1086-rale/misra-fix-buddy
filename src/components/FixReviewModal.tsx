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
        // Original should be denumbered (clean C++ code), Fixed should be numbered for editing
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

  // Highlight differences with review status and add click handlers
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
        // Get all available changes from snippet keys
        const allChanges = [...(reviewData.pending_changes || []), ...(reviewData.accepted_changes || []), ...(reviewData.rejected_changes || [])];
        
        // Find if this line corresponds to a reviewable change
        const lineKey = allChanges.find(key => {
          const baseLineNum = parseInt(key.replace(/[a-z]/g, ''));
          if (key.includes('a')) {
            // For added lines (e.g., "5a"), match the line after base line
            return baseLineNum + 1 === index + 1;
          } else {
            // For modified lines, match exact line number
            return baseLineNum === index + 1;
          }
        });
        
        if (lineKey) {
          const isAccepted = reviewData.accepted_changes?.includes(lineKey);
          const isRejected = reviewData.rejected_changes?.includes(lineKey);
          const isPending = reviewData.pending_changes?.includes(lineKey);
          const isCurrent = currentLineKey === lineKey;
        
          // Only show actions for changed/added lines that are pending review
          const isChangedOrAdded = addedLines.has(index) || changedLines.has(index);
          
          if (isChangedOrAdded) {
            if (isAccepted) {
              className = 'bg-green-50 border-l-2 border-l-green-400 dark:bg-green-950/20 dark:border-l-green-500';
              statusBadge = <Badge variant="default" className="ml-2 text-xs">✓ Accepted</Badge>;
            } else if (isRejected) {
              className = 'bg-red-50 border-l-2 border-l-red-400 dark:bg-red-950/20 dark:border-l-red-500';
              statusBadge = <Badge variant="destructive" className="ml-2 text-xs">✗ Rejected</Badge>;
            } else if (isPending) {
              className = 'bg-yellow-50 border-l-2 border-l-yellow-400 dark:bg-yellow-950/20 dark:border-l-yellow-500';
              statusBadge = <Badge variant="secondary" className="ml-2 text-xs">⏳ Pending</Badge>;
              
              // Add accept/reject buttons for pending changes
              actionButtons = (
                <div className="flex gap-1 ml-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs bg-green-50 hover:bg-green-100 border-green-300"
                    onClick={() => handleAcceptChange(lineKey)}
                    disabled={isLoading}
                  >
                    ✓
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs bg-red-50 hover:bg-red-100 border-red-300"
                    onClick={() => handleRejectChange(lineKey)}
                    disabled={isLoading}
                  >
                    ✗
                  </Button>
                </div>
              );
            }
            
            if (isCurrent) {
              className += ' ring-2 ring-primary';
            }
          }
        }
      } else {
        // Original code - just highlight changed lines without review status
        if (changedLines.has(index)) {
          className = 'bg-blue-50 border-l-2 border-l-blue-400 dark:bg-blue-950/20 dark:border-l-blue-500';
        }
      }
      
      return (
        <div key={index} className={`${className} px-2 py-0.5 flex items-center justify-between hover:bg-muted/50`}>
          <span className="font-mono text-sm">{line}</span>
          <div className="flex items-center">
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
        <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words leading-5">
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
            Code Fix Review
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
          {currentLineKey && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">Current Change:</span>
              <Badge variant="outline">Line {currentLineKey}</Badge>
              <div className="flex gap-2 ml-auto">
                <Button
                  size="sm"
                  onClick={() => handleAcceptChange()}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleRejectChange()}
                  disabled={isLoading}
                >
                  <XIcon className="w-4 h-4 mr-1" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleNavigate('prev')}
                  disabled={isLoading}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleNavigate('next')}
                  disabled={isLoading}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* View Options */}
          <Tabs defaultValue="review" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="review">Review Mode</TabsTrigger>
              <TabsTrigger value="diff">All Changes</TabsTrigger>
              <TabsTrigger value="accepted">Accepted Only</TabsTrigger>
              <TabsTrigger value="original">Original Code</TabsTrigger>
            </TabsList>

            <TabsContent value="review" className="mt-4">
              <div className="grid grid-cols-2 gap-0 h-[500px] border rounded-lg">
                {renderCodeBlock(originalCode, "Original Code", true)}
                <div className="border-l">
                  {renderCodeBlock(fixedCode, "Fixed Code (Click ✓/✗ to Accept/Reject)", false)}
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs">✓</Badge>
                  <span>Accepted changes</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs">✗</Badge>
                  <span>Rejected changes</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">⏳</Badge>
                  <span>Pending review</span>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="diff" className="mt-4">
              <div className="grid grid-cols-2 gap-0 h-[500px] border rounded-lg">
                {renderCodeBlock(originalCode, "Original", true)}
                <div className="border-l">
                  {renderCodeBlock(fixedCode, "All Fixed Changes", false)}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="accepted" className="mt-4">
              <div className="grid grid-cols-2 gap-0 h-[500px] border rounded-lg">
                {renderCodeBlock(originalCode, "Original", true)}
                <div className="border-l">
                  {renderCodeBlock(fixedCode, "Accepted Changes Only", false)}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="original" className="mt-4">
              <div className="h-[500px] border rounded-lg overflow-hidden">
                {renderCodeBlock(originalCode, "Original Code")}
              </div>
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center pt-4 border-t gap-3">
            <Button variant="outline" onClick={onClose} className="order-2 sm:order-1">
              Close
            </Button>
            <Button 
              onClick={downloadFinalFile}
              disabled={isLoading || reviewData.reviewed_count === 0}
              className="order-1 sm:order-2"
            >
              <Download className="w-4 h-4 mr-2" />
              {isLoading ? 'Processing...' : 'Download Accepted Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}