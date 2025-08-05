import React, { useState, useEffect, useCallback } from 'react';
import { X, Check, RotateCcw, Eye, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';

interface FixReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FixReviewModal({ isOpen, onClose }: FixReviewModalProps) {
  const { state, dispatch } = useAppContext();
  const { toast } = useToast();
  const [originalCode, setOriginalCode] = useState<string>('');
  const [fixedCode, setFixedCode] = useState<string>('');
  const [fixes, setFixes] = useState<any[]>([]);
  const [highlightData, setHighlightData] = useState<{
    line_mappings: Record<number, number>;
    changed_lines: number[];
    changed_lines_fixed: number[];
    added_lines: number[];
    removed_lines: number[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load code content when modal opens and when violations change
  useEffect(() => {
    if (isOpen && state.projectId) {
      loadCodeContent();
      loadFixData();
    }
  }, [isOpen, state.projectId, state.selectedViolations]);

  const loadCodeContent = async () => {
    if (!state.projectId) return;
    
    setIsLoading(true);
    try {
      // Use the diff API to get proper comparison
      const diffResult = await apiClient.getDiff(state.projectId);

      if (diffResult.success && diffResult.data) {
        setOriginalCode(diffResult.data.original);
        setFixedCode(diffResult.data.fixed);
        setHighlightData(diffResult.data.highlight || null);
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

  const downloadFinalFile = async () => {
    if (!state.projectId) return;
    
    try {
      setIsLoading(true);
      
      // First apply fixes and denumber
      const mergeResponse = await apiClient.applyFixes(state.projectId);
      
      if (mergeResponse.success) {
        // Then download the final file
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
            description: "Fixed file downloaded successfully" 
          });
          onClose();
        } else {
          throw new Error('Failed to download file');
        }
      } else {
        throw new Error(mergeResponse.error || 'Failed to apply fixes');
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

  const loadFixData = async () => {
    if (!state.projectId) return;

    try {
      const fixData = await apiClient.getFixes(state.projectId);
      if (fixData.success && fixData.data) {
        setFixes(fixData.data);
      } else {
        console.error('Failed to load fix data:', fixData.error);
        toast({
          title: "Error",
          description: "Failed to load fix data",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Failed to load fix data:', error);
      toast({
        title: "Error",
        description: "Failed to load fix data",
        variant: "destructive",
      });
    }
  };

  const handleSingleLineAction = async (lineKey: string, action: 'accept' | 'reject') => {
    if (!state.projectId) return;

    try {
      const response = await apiClient.updateFixStatus(state.projectId, lineKey, action);
      if (response.success) {
        // Optimistically update the state
        setFixes(prevFixes =>
          prevFixes.map(fix =>
            fix.line_key === lineKey ? { ...fix, status: action } : fix
          )
        );
        toast({
          title: "Success",
          description: `Line ${lineKey} ${action === 'accept' ? 'accepted' : 'rejected'}`,
        });
      } else {
        throw new Error(response.error || 'Failed to update fix status');
      }
    } catch (error) {
      console.error('Failed to update fix status:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to update fix status',
        variant: "destructive",
      });
    }
  };

  const handleSingleLineReset = async (lineKey: string) => {
    if (!state.projectId) return;

    try {
      const response = await apiClient.resetFixStatus(state.projectId, lineKey);
      if (response.success) {
        // Optimistically update the state
        setFixes(prevFixes =>
          prevFixes.map(fix =>
            fix.line_key === lineKey ? { ...fix, status: 'pending' } : fix
          )
        );
        toast({
          title: "Success",
          description: `Line ${lineKey} reset to pending`,
        });
      } else {
        throw new Error(response.error || 'Failed to reset fix status');
      }
    } catch (error) {
      console.error('Failed to reset fix status:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to reset fix status',
        variant: "destructive",
      });
    }
  };

  const handleGroupReset = async (lineKeys: string[]) => {
    if (!state.projectId) return;

    try {
      const response = await apiClient.resetFixesStatus(state.projectId, lineKeys);
      if (response.success) {
        // Optimistically update the state
        setFixes(prevFixes =>
          prevFixes.map(fix =>
            lineKeys.includes(fix.line_key) ? { ...fix, status: 'pending' } : fix
          )
        );
        toast({
          title: "Success",
          description: `Group reset to pending`,
        });
      } else {
        throw new Error(response.error || 'Failed to reset fix status');
      }
    } catch (error) {
      console.error('Failed to reset fix status:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to reset fix status',
        variant: "destructive",
      });
    }
  };

  const handleViolationGroupAction = async (lineKeys: string[], action: 'accept' | 'reject') => {
    if (!state.projectId) return;

    try {
      const response = await apiClient.updateFixesStatus(state.projectId, lineKeys, action);
      if (response.success) {
        // Optimistically update the state
        setFixes(prevFixes =>
          prevFixes.map(fix =>
            lineKeys.includes(fix.line_key) ? { ...fix, status: action } : fix
          )
        );
        toast({
          title: "Success",
          description: `Group ${action === 'accept' ? 'accepted' : 'rejected'}`,
        });
      } else {
        throw new Error(response.error || 'Failed to update fix status');
      }
    } catch (error) {
      console.error('Failed to update fix status:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to update fix status',
        variant: "destructive",
      });
    }
  };

  const getViolationMapping = () => {
    const violationMapping: Record<number, string[]> = {};

    if (state.selectedViolations) {
      state.selectedViolations.forEach(violation => {
        const line = violation.line;
        if (violationMapping[line]) {
          violationMapping[line].push(violation.key);
        } else {
          violationMapping[line] = [violation.key];
        }
      });
    }

    return violationMapping;
  };

  const getViolationGroups = () => {
    const violationMapping = getViolationMapping();
    const violationGroups: { line: number; violations: string[] }[] = [];

    Object.keys(violationMapping).forEach(line => {
      violationGroups.push({
        line: parseInt(line),
        violations: violationMapping[parseInt(line)],
      });
    });

    return violationGroups;
  };

  const getViolationGroupForLine = (lineNum: number) => {
    const violationGroups = getViolationGroups();
    return violationGroups.find(group => group.line === lineNum);
  };

  const resolveLineConflicts = (acceptedLines: Set<number>, rejectedLines: Set<number>) => {
    acceptedLines.forEach(line => rejectedLines.delete(line));
  };

  const shouldShowGroupButtons = (lineNum: number, relatedLineKeys: string[]) => {
    // Check if all related lines are pending
    return relatedLineKeys.every(lineKey => {
      const fix = fixes.find(fix => fix.line_key === lineKey);
      return fix && fix.status === 'pending';
    });
  };

  const renderCodeWithActions = (code: string, isOriginal: boolean) => {
    if (!code) return <div className="p-4 text-muted-foreground">Loading...</div>;

    const codeLines = code.split('\n');
    const violationGroups = getViolationGroups();

    return (
      <div className="relative">
        {codeLines.map((line, index) => {
          const lineNum = index + 1;
          const lineKey = lineNum.toString();
          const currentFix = fixes.find(fix => fix.line_key === lineKey);
          
          // Get violation group info for this line
          const violationGroup = getViolationGroupForLine(lineNum);
          const relatedLineKeys = violationGroup ? violationGroup.lines.map(l => l.toString()) : [lineKey];
          
          // Determine line highlighting
          let bgColor = '';
          let borderColor = '';
          
          if (highlightData) {
            const isChanged = !isOriginal && highlightData.changed_lines_fixed?.includes(lineNum);
            const isAdded = !isOriginal && highlightData.added_lines?.includes(lineNum);
            const isRemoved = isOriginal && highlightData.removed_lines?.includes(lineNum);
            
            if (currentFix) {
              // Line has fix - show status colors
              if (currentFix.status === 'accepted') {
                bgColor = 'bg-green-50 dark:bg-green-950/20';
                borderColor = 'border-l-green-500';
              } else if (currentFix.status === 'rejected') {
                bgColor = 'bg-red-50 dark:bg-red-950/20';
                borderColor = 'border-l-red-500';
              } else {
                bgColor = isAdded ? 'bg-blue-50 dark:bg-blue-950/20' : 'bg-yellow-50 dark:bg-yellow-950/20';
                borderColor = isAdded ? 'border-l-blue-400' : 'border-l-yellow-400';
              }
            } else if (isAdded) {
              bgColor = 'bg-green-50 dark:bg-green-950/20';
              borderColor = 'border-l-green-400';
            } else if (isChanged) {
              bgColor = 'bg-yellow-50 dark:bg-yellow-950/20';
              borderColor = 'border-l-yellow-400';
            } else if (isRemoved) {
              bgColor = 'bg-red-50 dark:bg-red-950/20';
              borderColor = 'border-l-red-400';
            }
          }

          return (
            <div
              key={index}
              className={`group relative flex items-center min-h-[1.75rem] ${bgColor} ${borderColor ? `border-l-2 ${borderColor}` : ''}`}
            >
              {/* Line number */}
              <div className="flex-shrink-0 w-12 px-2 py-1 text-xs text-muted-foreground font-mono text-right border-r">
                {lineNum}
              </div>
              
              {/* Code content with consistent spacing */}
              <div className="flex-1 px-3 py-1 font-mono text-sm leading-6 whitespace-pre-wrap break-all">
                {line || '\u00A0'} {/* Use non-breaking space for empty lines to maintain height */}
              </div>

              {/* Action buttons for fixed code */}
              {!isOriginal && currentFix && (
                <div className="flex-shrink-0 flex items-center gap-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {currentFix.status === 'pending' ? (
                    <>
                      {shouldShowGroupButtons(lineNum, relatedLineKeys) && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViolationGroupAction(relatedLineKeys, 'accept')}
                            className="h-6 px-2 text-xs bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            {relatedLineKeys.length > 1 && (
                              <span className="ml-1 px-1 bg-green-200 text-green-800 rounded text-xs">
                                {relatedLineKeys.length}
                              </span>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViolationGroupAction(relatedLineKeys, 'reject')}
                            className="h-6 px-2 text-xs bg-red-50 hover:bg-red-100 border-red-200 text-red-700"
                          >
                            <X className="w-3 h-3 mr-1" />
                            {relatedLineKeys.length > 1 && (
                              <span className="ml-1 px-1 bg-red-200 text-red-800 rounded text-xs">
                                {relatedLineKeys.length}
                              </span>
                            )}
                          </Button>
                        </>
                      )}
                      {!shouldShowGroupButtons(lineNum, relatedLineKeys) && (
                        <div className="h-6 w-16"></div> // Placeholder to maintain alignment
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <span className={`text-xs px-2 py-1 rounded ${
                          currentFix.status === 'accepted' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {currentFix.status === 'accepted' ? 'Accepted' : 'Rejected'}
                        </span>
                        {shouldShowGroupButtons(lineNum, relatedLineKeys) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGroupReset(relatedLineKeys)}
                            className="h-6 px-2 text-xs"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Placeholder for original code to maintain consistent width */}
              {isOriginal && (
                <div className="flex-shrink-0 w-32"></div>
              )}
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
      <ScrollArea className="flex-1 h-[600px]">
        <div className="min-h-full">
          {code ? (
            isOriginal !== undefined ? (
              renderCodeWithActions(code, isOriginal)
            ) : (
              <pre className="p-4 text-sm font-mono whitespace-pre-wrap leading-6">
                <code>{code}</code>
              </pre>
            )
          ) : (
            <div className="p-4 text-muted-foreground">Loading...</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Code Review
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* View Options */}
          <Tabs defaultValue="diff" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="diff">Diff</TabsTrigger>
              <TabsTrigger value="original">Original Code</TabsTrigger>
              <TabsTrigger value="fixed">Fixed Code</TabsTrigger>
            </TabsList>

            <TabsContent value="diff" className="mt-4">
              <div className="grid grid-cols-2 gap-0 h-[600px] border rounded-lg">
                {renderCodeBlock(originalCode, "Original (Numbered)", true)}
                <div className="border-l">
                  {renderCodeBlock(fixedCode, "Fixed (With Actions)", false)}
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-50 border-l-2 border-l-red-400 dark:bg-red-950/20 dark:border-l-red-500"></div>
                  <span>Removed lines</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-yellow-50 border-l-2 border-l-yellow-400 dark:bg-yellow-950/20 dark:border-l-yellow-500"></div>
                  <span>Modified lines</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-50 border-l-2 border-l-green-400 dark:bg-green-950/20 dark:border-l-green-500"></div>
                  <span>Added lines</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-50 border-l-2 border-l-blue-400 dark:bg-blue-950/20 dark:border-l-blue-500"></div>
                  <span>Suggested lines</span>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="original" className="mt-4">
              <div className="h-[600px] border rounded-lg overflow-hidden">
                {renderCodeBlock(originalCode, "Original Code (Numbered)", true)}
              </div>
            </TabsContent>

            <TabsContent value="fixed" className="mt-4">
              <div className="h-[600px] border rounded-lg overflow-hidden">
                {renderCodeBlock(fixedCode, "Fixed Code (With Actions)", false)}
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
              disabled={isLoading}
              className="order-1 sm:order-2"
            >
              <Download className="w-4 h-4 mr-2" />
              {isLoading ? 'Processing...' : 'Download Final File'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
