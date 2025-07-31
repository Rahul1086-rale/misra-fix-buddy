import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Eye, Code2, Check, X as XIcon, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';

interface FixReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Fix {
  index: number;
  line_key: string;
  content: string;
  status: 'accepted' | 'rejected' | 'pending';
}

interface ReviewSummary {
  total_fixes: number;
  accepted_count: number;
  rejected_count: number;
  pending_count: number;
  current_review_index: number;
}

export default function FixReviewModal({ isOpen, onClose }: FixReviewModalProps) {
  const { state, dispatch } = useAppContext();
  const { toast } = useToast();
  
  const [originalCode, setOriginalCode] = useState<string>('');
  const [fixedCode, setFixedCode] = useState<string>('');
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [currentFixIndex, setCurrentFixIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightData, setHighlightData] = useState<any>(null);
  const [codeSnippets, setCodeSnippets] = useState<any>({});
  
  const originalScrollRef = useRef<HTMLDivElement>(null);
  const fixedScrollRef = useRef<HTMLDivElement>(null);

  // Load review data when modal opens
  useEffect(() => {
    if (isOpen && state.projectId) {
      loadReviewData();
    }
  }, [isOpen, state.projectId]);

  // Auto-scroll to current fix when index changes
  useEffect(() => {
    if (fixes.length > 0 && currentFixIndex < fixes.length) {
      scrollToFix(fixes[currentFixIndex]);
    }
  }, [currentFixIndex, fixes]);

  const loadReviewData = async () => {
    if (!state.projectId) return;
    
    setIsLoading(true);
    try {
      // Load review state, diff data, and code snippets in parallel
      const [reviewResponse, diffResponse, snippetsResponse] = await Promise.all([
        apiClient.getReviewState(state.projectId),
        apiClient.getDiff(state.projectId),
        apiClient.getCodeSnippets(state.projectId)
      ]);

      if (reviewResponse.success && reviewResponse.data) {
        setFixes(reviewResponse.data.fixes);
        setSummary(reviewResponse.data.summary);
        setCurrentFixIndex(reviewResponse.data.summary.current_review_index || 0);
      }

      if (diffResponse.success && diffResponse.data) {
        setOriginalCode(diffResponse.data.original);
        setFixedCode(diffResponse.data.fixed);
        setHighlightData(diffResponse.data.highlight);
      }

      if (snippetsResponse.success && snippetsResponse.data) {
        setCodeSnippets(snippetsResponse.data);
      }
    } catch (error) {
      console.error('Failed to load review data:', error);
      toast({
        title: "Error",
        description: "Failed to load review data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewAction = async (line_key: string, action: 'accept' | 'reject') => {
    if (!state.projectId) return;
    
    try {
      const response = await apiClient.reviewAction(state.projectId, line_key, action);
      
      if (response.success) {
        // Update local state
        setFixes(prev => prev.map(fix => 
          fix.line_key === line_key 
            ? { ...fix, status: action === 'accept' ? 'accepted' : 'rejected' }
            : fix
        ));
        
        // Update summary
        if (summary) {
          const newSummary = { ...summary };
          if (action === 'accept') {
            newSummary.accepted_count += 1;
            newSummary.pending_count -= 1;
          } else {
            newSummary.rejected_count += 1;
            newSummary.pending_count -= 1;
          }
          setSummary(newSummary);
        }
        
        // Auto-advance to next pending fix
        const nextPendingIndex = fixes.findIndex((fix, index) => 
          index > currentFixIndex && fix.status === 'pending'
        );
        
        if (nextPendingIndex !== -1) {
          setCurrentFixIndex(nextPendingIndex);
          await apiClient.navigateReview(state.projectId, nextPendingIndex);
        }
        
        toast({
          title: "Success",
          description: `Fix ${action}ed successfully`,
        });
        
        // Reload diff to show updated changes
        const diffResponse = await apiClient.getDiff(state.projectId);
        if (diffResponse.success && diffResponse.data) {
          setOriginalCode(diffResponse.data.original);
          setFixedCode(diffResponse.data.fixed);
          setHighlightData(diffResponse.data.highlight);
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action} fix`,
        variant: "destructive",
      });
    }
  };

  const navigateToFix = async (index: number) => {
    if (index >= 0 && index < fixes.length && state.projectId) {
      setCurrentFixIndex(index);
      await apiClient.navigateReview(state.projectId, index);
      scrollToFix(fixes[index]);
    }
  };

  const scrollToFix = (fix: Fix) => {
    // Extract line number from line_key (e.g., "123" or "123a")
    const lineMatch = fix.line_key.match(/^(\d+)/);
    if (lineMatch) {
      const lineNumber = parseInt(lineMatch[1]);
      // Scroll both panes to the approximate line
      if (originalScrollRef.current && fixedScrollRef.current) {
        const scrollPosition = Math.max(0, (lineNumber - 5) * 20); // Approximate line height
        originalScrollRef.current.scrollTop = scrollPosition;
        fixedScrollRef.current.scrollTop = scrollPosition;
      }
    }
  };

  const resetReview = async () => {
    if (!state.projectId) return;
    
    try {
      const response = await apiClient.resetReview(state.projectId);
      if (response.success) {
        toast({
          title: "Success",
          description: "Review reset successfully",
        });
        loadReviewData(); // Reload all data
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reset review",
        variant: "destructive",
      });
    }
  };

  const downloadAcceptedFixes = async () => {
    if (!state.projectId) return;
    
    try {
      setIsLoading(true);
      
      // Apply only accepted fixes
      const mergeResponse = await apiClient.applyAcceptedFixes(state.projectId);
      
      if (mergeResponse.success) {
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
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isSyncingScroll = useRef(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>, isOriginal: boolean) => {
    if (isSyncingScroll.current) return;

    const current = e.currentTarget;
    const other = isOriginal ? fixedScrollRef.current : originalScrollRef.current;

    if (!other) return;

    isSyncingScroll.current = true;
    other.scrollTop = current.scrollTop;
    other.scrollLeft = current.scrollLeft;

    setTimeout(() => {
      isSyncingScroll.current = false;
    }, 10);
  };

  const highlightDifferences = (code: string, isOriginal: boolean) => {
    if (!originalCode || !fixedCode || !highlightData) return code;
    
    const codeLines = code.split('\n');
    const changedLines = new Set<number>();
    const addedLines = new Set<number>();
    
    if (isOriginal) {
      highlightData.changed_lines?.forEach((lineNum: number) => {
        changedLines.add(lineNum - 1);
      });
    } else {
      highlightData.changed_lines_fixed?.forEach((lineNum: number) => {
        changedLines.add(lineNum - 1);
      });
      highlightData.added_lines?.forEach((lineNum: number) => {
        addedLines.add(lineNum - 1);
      });
    }
    
    return codeLines.map((line, index) => {
      let className = '';
      
      if (addedLines.has(index)) {
        className = 'bg-green-50 border-l-2 border-l-green-400 dark:bg-green-950/20 dark:border-l-green-500';
      } else if (changedLines.has(index)) {
        className = isOriginal 
          ? 'bg-red-50 border-l-2 border-l-red-400 dark:bg-red-950/20 dark:border-l-red-500'
          : 'bg-yellow-50 border-l-2 border-l-yellow-400 dark:bg-yellow-950/20 dark:border-l-yellow-500';
      }
      
      return (
        <div key={index} className={`${className} px-2 py-0.5`}>
          {line}
        </div>
      );
    });
  };

  // Function to compare original line with fixed snippet content
  const getLineChangeType = (lineKey: string, originalLines: string[]) => {
    const lineNumber = parseInt(lineKey.match(/^(\d+)/)?.[1] || '0');
    const isNewLine = /[a-z]$/.test(lineKey);
    
    if (isNewLine) {
      return { type: 'added', originalContent: '', fixedContent: codeSnippets[lineKey] || '' };
    }
    
    const originalContent = originalLines[lineNumber - 1]?.trim() || '';
    const fixedContent = codeSnippets[lineKey]?.trim() || '';
    
    if (!originalContent && fixedContent) {
      return { type: 'added', originalContent: '', fixedContent };
    }
    
    if (originalContent && !fixedContent) {
      return { type: 'deleted', originalContent, fixedContent: '' };
    }
    
    if (originalContent !== fixedContent) {
      return { type: 'modified', originalContent, fixedContent };
    }
    
    return { type: 'unchanged', originalContent, fixedContent };
  };

  // Render inline diff view with accept/reject buttons for each change
  const renderInlineDiffView = () => {
    if (!originalCode || !codeSnippets) return <div>Loading...</div>;
    
    const originalLines = originalCode.split('\n');
    const sortedSnippetKeys = Object.keys(codeSnippets).sort((a, b) => {
      const aNum = parseInt(a.match(/^(\d+)/)?.[1] || '0');
      const bNum = parseInt(b.match(/^(\d+)/)?.[1] || '0');
      return aNum - bNum || a.localeCompare(b);
    });

    return (
      <div className="space-y-2">
        {sortedSnippetKeys.map((lineKey) => {
          const changeInfo = getLineChangeType(lineKey, originalLines);
          const fix = fixes.find(f => f.line_key === lineKey);
          
          // Only show if there's an actual change
          if (changeInfo.type === 'unchanged') return null;
          
          return (
            <div key={lineKey} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Line {lineKey}</span>
                  <Badge variant={
                    changeInfo.type === 'added' ? 'default' :
                    changeInfo.type === 'deleted' ? 'destructive' : 'secondary'
                  }>
                    {changeInfo.type.charAt(0).toUpperCase() + changeInfo.type.slice(1)}
                  </Badge>
                  {fix && (
                    <Badge variant={
                      fix.status === 'accepted' ? 'default' :
                      fix.status === 'rejected' ? 'destructive' : 'secondary'
                    }>
                      {fix.status}
                    </Badge>
                  )}
                </div>
                
                {fix && fix.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReviewAction(lineKey, 'reject')}
                      className="text-red-600 hover:text-red-700"
                    >
                      <XIcon className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleReviewAction(lineKey, 'accept')}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Accept
                    </Button>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {changeInfo.type !== 'added' && (
                  <div>
                    <div className="text-sm font-medium text-red-600 mb-2">Original</div>
                    <div className="bg-red-50 border border-red-200 p-3 rounded font-mono text-sm dark:bg-red-950/20 dark:border-red-800">
                      {changeInfo.type === 'deleted' ? (
                        <span className="text-red-600">- {changeInfo.originalContent}</span>
                      ) : (
                        changeInfo.originalContent || <span className="text-muted-foreground">(empty line)</span>
                      )}
                    </div>
                  </div>
                )}
                
                {changeInfo.type !== 'deleted' && (
                  <div>
                    <div className="text-sm font-medium text-green-600 mb-2">Fixed</div>
                    <div className="bg-green-50 border border-green-200 p-3 rounded font-mono text-sm dark:bg-green-950/20 dark:border-green-800">
                      <span className="text-green-600">+ {changeInfo.fixedContent}</span>
                    </div>
                  </div>
                )}
                
                {changeInfo.type === 'deleted' && (
                  <div>
                    <div className="text-sm font-medium text-gray-600 mb-2">Result</div>
                    <div className="bg-gray-50 border border-gray-200 p-3 rounded font-mono text-sm dark:bg-gray-950/20 dark:border-gray-800">
                      <span className="text-gray-600">(line deleted)</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
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
        onScroll={(e) => handleScroll(e, !!isOriginal)}
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

  const currentFix = fixes[currentFixIndex];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Code Fix Review
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Review Summary */}
          {summary && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  Review Progress
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetReview}
                    className="flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold">{summary.total_fixes}</div>
                    <div className="text-sm text-muted-foreground">Total Fixes</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{summary.accepted_count}</div>
                    <div className="text-sm text-muted-foreground">Accepted</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">{summary.rejected_count}</div>
                    <div className="text-sm text-muted-foreground">Rejected</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-600">{summary.pending_count}</div>
                    <div className="text-sm text-muted-foreground">Pending</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Current Fix Review */}
          {currentFix && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Fix {currentFixIndex + 1} of {fixes.length} - Line {currentFix.line_key}</span>
                  <Badge variant={
                    currentFix.status === 'accepted' ? 'default' :
                    currentFix.status === 'rejected' ? 'destructive' : 'secondary'
                  }>
                    {currentFix.status.charAt(0).toUpperCase() + currentFix.status.slice(1)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-muted p-3 rounded font-mono text-sm">
                    {currentFix.content}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateToFix(Math.max(0, currentFixIndex - 1))}
                        disabled={currentFixIndex === 0}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateToFix(Math.min(fixes.length - 1, currentFixIndex + 1))}
                        disabled={currentFixIndex === fixes.length - 1}
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReviewAction(currentFix.line_key, 'reject')}
                        disabled={currentFix.status === 'rejected'}
                        className="text-red-600 hover:text-red-700"
                      >
                        <XIcon className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleReviewAction(currentFix.line_key, 'accept')}
                        disabled={currentFix.status === 'accepted'}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Accept
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Code Diff View */}
          <Tabs defaultValue="inline" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="inline">Inline Review</TabsTrigger>
              <TabsTrigger value="diff">Diff View</TabsTrigger>
              <TabsTrigger value="original">Original Code</TabsTrigger>
              <TabsTrigger value="fixed">Fixed Code (Accepted Changes)</TabsTrigger>
            </TabsList>

            <TabsContent value="inline" className="mt-4">
              <div className="h-[500px] overflow-auto">
                {renderInlineDiffView()}
              </div>
            </TabsContent>

            <TabsContent value="diff" className="mt-4">
              <div className="grid grid-cols-2 gap-0 h-[500px] border rounded-lg">
                {renderCodeBlock(originalCode, "Original Code", true)}
                <div className="border-l">
                  {renderCodeBlock(fixedCode, "Fixed Code (Accepted Changes Only)", false)}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="original" className="mt-4">
              <div className="h-[500px] border rounded-lg overflow-hidden">
                {renderCodeBlock(originalCode, "Original Code")}
              </div>
            </TabsContent>

            <TabsContent value="fixed" className="mt-4">
              <div className="h-[500px] border rounded-lg overflow-hidden">
                {renderCodeBlock(fixedCode, "Fixed Code (Accepted Changes Only)")}
              </div>
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center pt-4 border-t gap-3">
            <Button variant="outline" onClick={onClose} className="order-2 sm:order-1">
              Close
            </Button>
            <Button 
              onClick={downloadAcceptedFixes}
              disabled={isLoading || (summary?.accepted_count === 0)}
              className="order-1 sm:order-2"
            >
              <Download className="w-4 h-4 mr-2" />
              {isLoading ? 'Processing...' : `Download File (${summary?.accepted_count || 0} fixes)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}