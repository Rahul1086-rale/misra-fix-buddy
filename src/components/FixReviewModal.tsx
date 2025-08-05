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
  const [violationMapping, setViolationMapping] = useState<any>({});
  
  const originalScrollRef = useRef<HTMLDivElement>(null);
  const fixedScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && state.projectId) {
      loadReviewData();
    }
  }, [isOpen, state.projectId]);

  useEffect(() => {
    if (fixes.length > 0 && currentFixIndex < fixes.length) {
      scrollToFix(fixes[currentFixIndex]);
    }
  }, [currentFixIndex, fixes]);

  const loadReviewData = async () => {
    if (!state.projectId) return;
    
    setIsLoading(true);
    try {
      // Load review state, diff data, code snippets, and violation mapping in parallel
      const [reviewResponse, diffResponse, snippetsResponse, violationMappingResponse] = await Promise.all([
        apiClient.getReviewState(state.projectId),
        apiClient.getDiff(state.projectId),
        apiClient.getCodeSnippets(state.projectId),
        apiClient.getViolationMapping(state.projectId)
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

      if (violationMappingResponse.success && violationMappingResponse.data) {
        setViolationMapping(violationMappingResponse.data);
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
        const updatedFixes = fixes.map(fix => 
          fix.line_key === line_key 
            ? { ...fix, status: action === 'accept' ? 'accepted' as const : 'rejected' as const }
            : fix
        );
        setFixes(updatedFixes);
        
        // Update summary
        if (summary) {
          const currentFix = fixes.find(fix => fix.line_key === line_key);
          const newSummary = { ...summary };
          
          // Adjust counts based on previous state
          if (currentFix?.status === 'accepted') {
            newSummary.accepted_count -= 1;
          } else if (currentFix?.status === 'rejected') {
            newSummary.rejected_count -= 1;
          } else {
            newSummary.pending_count -= 1;
          }
          
          // Add to new state
          if (action === 'accept') {
            newSummary.accepted_count += 1;
          } else {
            newSummary.rejected_count += 1;
          }
          
          setSummary(newSummary);
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
        
        // Auto-advance to next pending fix with actual changes
        setTimeout(() => {
          const changedFixes = getActualChangedFixes();
          const currentChanged = changedFixes.find(fix => fix.line_key === fixes[currentFixIndex]?.line_key);
          const currentChangedIndex = currentChanged ? changedFixes.indexOf(currentChanged) : -1;
          
          // Find next pending fix with actual changes
          const nextPendingFix = changedFixes
            .slice(currentChangedIndex + 1)
            .find(fix => fix.status === 'pending');
          
          if (nextPendingFix) {
            const nextIndex = updatedFixes.findIndex(fix => fix.line_key === nextPendingFix.line_key);
            if (nextIndex !== -1 && nextIndex !== currentFixIndex) {
              setCurrentFixIndex(nextIndex);
              if (state.projectId) {
                apiClient.navigateReview(state.projectId, nextIndex);
              }
              scrollToFix(nextPendingFix);
            }
          }
        }, 100);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action} fix`,
        variant: "destructive",
      });
    }
  };

  const handleViolationGroupAction = async (lineKeys: string[], action: 'accept' | 'reject') => {
    if (!state.projectId || lineKeys.length === 0) return;
    
    try {
      // For conflicts resolution: collect all lines that are affected
      const allAffectedLines = new Set<string>();
      
      // Find all violation groups that contain any of the target lines
      const groups = getViolationGroups();
      Object.values(groups).forEach(group => {
        if (group.some(lineKey => lineKeys.includes(lineKey))) {
          group.forEach(lineKey => allAffectedLines.add(lineKey));
        }
      });
      
      // Process only the lines in this specific violation group
      const promises = lineKeys.map(lineKey => 
        apiClient.reviewAction(state.projectId!, lineKey, action)
      );
      
      const responses = await Promise.all(promises);
      const allSuccessful = responses.every(response => response.success);
      
      if (allSuccessful) {
        // Update local state with conflict resolution
        const updatedFixes = fixes.map(fix => {
          if (lineKeys.includes(fix.line_key)) {
            // This line is being explicitly changed
            return { ...fix, status: action === 'accept' ? 'accepted' as const : 'rejected' as const };
          }
          // For other lines, no changes needed as conflict resolution is handled by backend
          return fix;
        });
        setFixes(updatedFixes);
        
        // Update summary
        if (summary) {
          const newSummary = { ...summary };
          
          // Count changes by previous status
          let pendingToChange = 0;
          let acceptedToChange = 0;
          let rejectedToChange = 0;
          
          lineKeys.forEach(lineKey => {
            const currentFix = fixes.find(fix => fix.line_key === lineKey);
            if (currentFix?.status === 'pending') {
              pendingToChange += 1;
            } else if (currentFix?.status === 'accepted') {
              acceptedToChange += 1;
            } else if (currentFix?.status === 'rejected') {
              rejectedToChange += 1;
            }
          });
          
          // Adjust counts
          newSummary.pending_count -= pendingToChange;
          newSummary.accepted_count -= acceptedToChange;
          newSummary.rejected_count -= rejectedToChange;
          
          if (action === 'accept') {
            newSummary.accepted_count += lineKeys.length;
          } else {
            newSummary.rejected_count += lineKeys.length;
          }
          
          setSummary(newSummary);
        }
        
        toast({
          title: "Success",
          description: `Violation fix ${action}ed successfully (${lineKeys.length} line${lineKeys.length > 1 ? 's' : ''})`,
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
        description: `Failed to ${action} violation fix`,
        variant: "destructive",
      });
    }
  };

  const handleSingleLineReset = async (lineKey: string) => {
    if (!state.projectId) return;
    
    try {
      const response = await apiClient.reviewAction(state.projectId, lineKey, 'reset');
      
      if (response.success) {
        // Update local state to pending
        const updatedFixes = fixes.map(fix => 
          fix.line_key === lineKey 
            ? { ...fix, status: 'pending' as const }
            : fix
        );
        setFixes(updatedFixes);
        
        // Update summary
        const currentFix = fixes.find(fix => fix.line_key === lineKey);
        if (summary && currentFix) {
          const newSummary = { ...summary };
          if (currentFix.status === 'accepted') {
            newSummary.accepted_count -= 1;
          } else if (currentFix.status === 'rejected') {
            newSummary.rejected_count -= 1;
          }
          newSummary.pending_count += 1;
          setSummary(newSummary);
        }
        
        toast({
          title: "Success",
          description: "Fix reset to pending status",
        });
        
        // Reload diff to show updated changes
        const diffResponse = await apiClient.getDiff(state.projectId);
        if (diffResponse.success && diffResponse.data) {
          setOriginalCode(diffResponse.data.original);
          setFixedCode(diffResponse.data.fixed);
          setHighlightData(diffResponse.data.highlight);
        }
      } else {
        throw new Error(response.error || 'Failed to reset fix');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reset fix",
        variant: "destructive",
      });
    }
  };

  const handleGroupReset = async (lineKeys: string[]) => {
    if (!state.projectId || lineKeys.length === 0) return;
    
    try {
      // Reset all lines in the group
      const promises = lineKeys.map(lineKey => 
        apiClient.reviewAction(state.projectId!, lineKey, 'reset')
      );
      
      const responses = await Promise.all(promises);
      const allSuccessful = responses.every(response => response.success);
      
      if (allSuccessful) {
        // Update local state for all lines to pending
        const updatedFixes = fixes.map(fix => 
          lineKeys.includes(fix.line_key)
            ? { ...fix, status: 'pending' as const }
            : fix
        );
        setFixes(updatedFixes);
        
        // Update summary
        if (summary) {
          const newSummary = { ...summary };
          
          // Count changes by previous status
          let acceptedToReset = 0;
          let rejectedToReset = 0;
          
          lineKeys.forEach(lineKey => {
            const currentFix = fixes.find(fix => fix.line_key === lineKey);
            if (currentFix?.status === 'accepted') {
              acceptedToReset += 1;
            } else if (currentFix?.status === 'rejected') {
              rejectedToReset += 1;
            }
          });
          
          // Adjust counts
          newSummary.accepted_count -= acceptedToReset;
          newSummary.rejected_count -= rejectedToReset;
          newSummary.pending_count += (acceptedToReset + rejectedToReset);
          
          setSummary(newSummary);
        }
        
        toast({
          title: "Success",
          description: `Group reset to pending (${lineKeys.length} line${lineKeys.length > 1 ? 's' : ''})`,
        });
        
        // Reload diff to show updated changes
        const diffResponse = await apiClient.getDiff(state.projectId);
        if (diffResponse.success && diffResponse.data) {
          setOriginalCode(diffResponse.data.original);
          setFixedCode(diffResponse.data.fixed);
          setHighlightData(diffResponse.data.highlight);
        }
      } else {
        throw new Error('Some resets failed');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reset group",
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
        const scrollPosition = Math.max(0, (lineNumber - 5) * 28); // Use fixed line height of 28px
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
        } else {
          throw new Error('Failed to generate download file');
        }
      } else {
        throw new Error(mergeResponse.error || 'Failed to apply accepted fixes');
      }
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to download file",
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

  // Get violation groups based on violation mapping
  const getViolationGroups = () => {
    const groups: { [key: string]: string[] } = {};
    
    // Create groups based on violation mapping
    Object.keys(violationMapping).forEach(violationLine => {
      const mapping = violationMapping[violationLine];
      if (mapping && mapping.changed_lines) {
        // Use violation line as group key
        groups[violationLine] = mapping.changed_lines.filter((lineKey: string) => 
          lineKey in codeSnippets
        );
      }
    });
    
    // Handle orphaned lines (lines not in any violation mapping)
    Object.keys(codeSnippets).forEach(lineKey => {
      const isInAnyGroup = Object.values(groups).some(group => group.includes(lineKey));
      if (!isInAnyGroup) {
        // Create individual group for orphaned lines
        const baseLineMatch = lineKey.match(/^(\d+)/);
        if (baseLineMatch) {
          const baseLine = baseLineMatch[1];
          groups[`orphan_${baseLine}`] = [lineKey];
        }
      }
    });
    
    return groups;
  };

  // Find the violation group for a specific line
  const getViolationGroupForLine = (lineKey: string): string[] => {
    const groups = getViolationGroups();
    for (const groupKey in groups) {
      if (groups[groupKey].includes(lineKey)) {
        return groups[groupKey];
      }
    }
    return [lineKey]; // Fallback to single line
  };

  // Get the primary line (first line) of a violation group
  const getGroupPrimaryLine = (lineKeys: string[]): string => {
    return lineKeys.sort((a, b) => {
      const aNum = parseInt(a.match(/^(\d+)/)?.[1] || '0');
      const bNum = parseInt(b.match(/^(\d+)/)?.[1] || '0');
      return aNum - bNum || a.localeCompare(b);
    })[0];
  };

  // Check if this line should show the group action buttons
  const shouldShowGroupButtons = (lineKey: string): boolean => {
    const violationGroup = getViolationGroupForLine(lineKey);
    const primaryLine = getGroupPrimaryLine(violationGroup);
    return lineKey === primaryLine;
  };

  // Resolve conflicts when same line is in multiple violations
  const resolveLineConflicts = (lineKey: string): 'accepted' | 'rejected' | 'pending' => {
    const fix = fixes.find(f => f.line_key === lineKey);
    if (!fix) return 'pending';
    
    // Priority: accepted > rejected > pending
    return fix.status;
  };

  // Fixed diff highlighting with proper deleted line support and grouped buttons
  const highlightDifferencesWithActions = (code: string, isOriginal: boolean) => {
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
      const actualLineNumber = index + 1;
      const lineKey = actualLineNumber.toString();
      
      // Find the violation group for this line
      const relatedLineKeys = getViolationGroupForLine(lineKey);
      const allRelatedFixes = relatedLineKeys.map(key => fixes.find(f => f.line_key === key)).filter(Boolean);
      const primaryFix = allRelatedFixes[0];
      
      // Check if any related line has actual changes
      const hasActualChanges = relatedLineKeys.some(key => {
        const changeType = getLineChangeType(key, originalCode.split('\n'));
        return changeType.type !== 'unchanged';
      });
      
      // Check if this is a deleted line (exists in original but not in fixed)
      const isDeletedLine = isOriginal && changedLines.has(index) && 
        hasActualChanges && relatedLineKeys.some(key => {
          const changeType = getLineChangeType(key, originalCode.split('\n'));
          return changeType.type === 'deleted';
        });
      
      if (addedLines.has(index)) {
        className = 'bg-green-50 border-l-2 border-l-green-400 dark:bg-green-950/20 dark:border-l-green-500';
      } else if (changedLines.has(index)) {
        className = isOriginal 
          ? 'bg-red-50 border-l-2 border-l-red-400 dark:bg-red-950/20 dark:border-l-red-500'
          : 'bg-yellow-50 border-l-2 border-l-yellow-400 dark:bg-yellow-950/20 dark:border-l-yellow-500';
      }
      
      // Only show buttons on the fixed side for primary line of each group
      const showButtons = !isOriginal && hasActualChanges && shouldShowGroupButtons(lineKey);
      // Show placeholder space on original side to maintain alignment
      const showPlaceholder = isOriginal && hasActualChanges && shouldShowGroupButtons(lineKey);
      
      return (
        <div key={index} className={`${className} group relative`} style={{ minHeight: '28px', lineHeight: '28px' }}>
          <div className="flex items-center min-h-[28px]">
            {/* Line number - fixed width */}
            <div className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground text-xs font-mono">
              {actualLineNumber}
            </div>
            
            {/* Code content - flexible width */}
            <div className="flex-1 font-mono text-xs px-2 break-all" style={{ lineHeight: '28px' }}>
              {isOriginal && isDeletedLine ? `${line || '\u00A0'} (deleted)` : (line || '\u00A0')}
            </div>
            
            {/* Action buttons area - fixed width to maintain alignment */}
            <div className="w-32 flex-shrink-0 flex justify-end items-center gap-1 pr-2">
              {showButtons && primaryFix && (
                <>
                  {relatedLineKeys.length > 1 && (
                    <span className="text-xs text-muted-foreground px-1 bg-muted rounded">
                      {relatedLineKeys.length}
                    </span>
                  )}
                  {primaryFix.status === 'pending' ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViolationGroupAction(relatedLineKeys, 'reject')}
                        className="text-red-600 hover:text-red-700 h-6 px-2 text-xs"
                      >
                        <XIcon className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleViolationGroupAction(relatedLineKeys, 'accept')}
                        className="bg-green-600 hover:bg-green-700 h-6 px-2 text-xs"
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge 
                        variant={primaryFix.status === 'accepted' ? 'default' : 'destructive'}
                        className="text-xs h-5"
                      >
                        {primaryFix.status}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGroupReset(relatedLineKeys)}
                        className="h-6 px-2 text-xs"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </>
              )}
              {showPlaceholder && (
                <>
                  {relatedLineKeys.length > 1 && (
                    <span className="text-xs text-muted-foreground px-1 bg-muted rounded opacity-30">
                      {relatedLineKeys.length}
                    </span>
                  )}
                  {/* Fixed width placeholder to match button area */}
                  <div className="w-16 h-6 opacity-0"></div>
                </>
              )}
            </div>
          </div>
        </div>
      );
    });
  };

  const getLineChangeType = (lineKey: string, originalLines: string[]) => {
    const lineNumber = parseInt(lineKey.match(/^(\d+)/)?.[1] || '0');
    const isNewLine = /[a-z]$/.test(lineKey);
    const snippetContent = codeSnippets[lineKey];
    
    // Handle new lines (with suffix like 93a)
    if (isNewLine) {
      return { type: 'added', originalContent: '', fixedContent: snippetContent || '' };
    }
    
    // Get original line content
    const originalContent = originalLines[lineNumber - 1] || '';
    
    // Handle deleted lines - check if snippet is empty AND original line was not empty
    if (snippetContent === "" || snippetContent === null || snippetContent === undefined) {
      // Only consider it deleted if the original line had content
      if (originalContent.trim() !== "") {
        return { type: 'deleted', originalContent, fixedContent: '' };
      } else {
        // Both original and snippet are empty - no actual change
        return { type: 'unchanged', originalContent, fixedContent: snippetContent || '' };
      }
    }
    
    // Remove line number prefixes from both for comparison
    const cleanOriginal = originalContent.replace(/^\d+\s*/, '').trim();
    const cleanFixed = (snippetContent || '').replace(/^\d+\s*/, '').trim();
    
    // Compare actual content
    if (cleanOriginal !== cleanFixed) {
      return { type: 'modified', originalContent, fixedContent: snippetContent };
    }
    
    return { type: 'unchanged', originalContent, fixedContent: snippetContent };
  };

  const getActualChangedFixes = () => {
    if (!originalCode || !codeSnippets) return [];
    
    const originalLines = originalCode.split('\n');
    return fixes.filter(fix => {
      const changeType = getLineChangeType(fix.line_key, originalLines);
      return changeType.type !== 'unchanged';
    });
  };

  const navigateToNextChange = () => {
    const changedFixes = getActualChangedFixes();
    const currentChanged = changedFixes.find(fix => fix.line_key === currentFix?.line_key);
    const currentChangedIndex = currentChanged ? changedFixes.indexOf(currentChanged) : -1;
    
    if (currentChangedIndex < changedFixes.length - 1) {
      const nextFix = changedFixes[currentChangedIndex + 1];
      const nextIndex = fixes.findIndex(fix => fix.line_key === nextFix.line_key);
      navigateToFix(nextIndex);
    }
  };

  const navigateToPreviousChange = () => {
    const changedFixes = getActualChangedFixes();
    const currentChanged = changedFixes.find(fix => fix.line_key === currentFix?.line_key);
    const currentChangedIndex = currentChanged ? changedFixes.indexOf(currentChanged) : -1;
    
    if (currentChangedIndex > 0) {
      const prevFix = changedFixes[currentChangedIndex - 1];
      const prevIndex = fixes.findIndex(fix => fix.line_key === prevFix.line_key);
      navigateToFix(prevIndex);
    }
  };

  const handleAcceptAll = async () => {
    if (!state.projectId) return;
    
    const changedFixes = getActualChangedFixes();
    const allLineKeys = changedFixes.map(fix => fix.line_key);
    
    if (allLineKeys.length === 0) return;

    try {
      // Process all line keys
      const promises = allLineKeys.map(lineKey => 
        apiClient.reviewAction(state.projectId!, lineKey, 'accept')
      );
      
      const responses = await Promise.all(promises);
      const allSuccessful = responses.every(response => response.success);
      
      if (allSuccessful) {
        // Update local state for all lines
        const updatedFixes = fixes.map(fix => 
          allLineKeys.includes(fix.line_key)
            ? { ...fix, status: 'accepted' as const }
            : fix
        );
        setFixes(updatedFixes);
        
        // Update summary - set all to accepted, clear others
        if (summary) {
          setSummary({
            ...summary,
            accepted_count: allLineKeys.length,
            rejected_count: 0,
            pending_count: 0
          });
        }
        
        toast({
          title: "Success",
          description: `All ${allLineKeys.length} fixes accepted`,
        });
        
        // Reload diff
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
        description: "Failed to accept all fixes",
        variant: "destructive",
      });
    }
  };

  const handleRejectAll = async () => {
    if (!state.projectId) return;
    
    const changedFixes = getActualChangedFixes();
    const allLineKeys = changedFixes.map(fix => fix.line_key);
    
    if (allLineKeys.length === 0) return;

    try {
      // Process all line keys
      const promises = allLineKeys.map(lineKey => 
        apiClient.reviewAction(state.projectId!, lineKey, 'reject')
      );
      
      const responses = await Promise.all(promises);
      const allSuccessful = responses.every(response => response.success);
      
      if (allSuccessful) {
        // Update local state for all lines
        const updatedFixes = fixes.map(fix => 
          allLineKeys.includes(fix.line_key)
            ? { ...fix, status: 'rejected' as const }
            : fix
        );
        setFixes(updatedFixes);
        
        // Update summary - set all to rejected, clear others
        if (summary) {
          setSummary({
            ...summary,
            accepted_count: 0,
            rejected_count: allLineKeys.length,
            pending_count: 0
          });
        }
        
        toast({
          title: "Success",
          description: `All ${allLineKeys.length} fixes rejected`,
        });
        
        // Reload diff
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
        description: "Failed to reject all fixes",
        variant: "destructive",
      });
    }
  };

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
            <div key={lineKey} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium">Line {lineKey}</span>
                  <Badge variant={
                    changeInfo.type === 'added' ? 'default' :
                    changeInfo.type === 'deleted' ? 'destructive' : 'secondary'
                  } className="text-xs">
                    {changeInfo.type.charAt(0).toUpperCase() + changeInfo.type.slice(1)}
                  </Badge>
                  {fix && (
                    <Badge variant={
                      fix.status === 'accepted' ? 'default' :
                      fix.status === 'rejected' ? 'destructive' : 'secondary'
                    } className="text-xs">
                      {fix.status}
                    </Badge>
                  )}
                </div>
                
                {fix && (
                  <div className="flex gap-1 flex-wrap">
                    {fix.status === 'pending' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReviewAction(lineKey, 'reject')}
                          className="text-red-600 hover:text-red-700 text-xs h-6 px-2"
                        >
                          <XIcon className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleReviewAction(lineKey, 'accept')}
                          className="bg-green-600 hover:bg-green-700 text-xs h-6 px-2"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Accept
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSingleLineReset(lineKey)}
                        className="text-gray-600 hover:text-gray-700 text-xs h-6 px-2"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Reset
                      </Button>
                    )}
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {changeInfo.type !== 'added' && (
                  <div>
                    <div className="text-xs font-medium text-red-600 mb-1">Original</div>
                    <div className="bg-red-50 border border-red-200 p-2 rounded font-mono text-xs dark:bg-red-950/20 dark:border-red-800 break-all">
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
                    <div className="text-xs font-medium text-green-600 mb-1">Fixed</div>
                    <div className="bg-green-50 border border-green-200 p-2 rounded font-mono text-xs dark:bg-green-950/20 dark:border-green-800 break-all">
                      <span className="text-green-600">+ {changeInfo.fixedContent}</span>
                    </div>
                  </div>
                )}
                
                {changeInfo.type === 'deleted' && (
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Result</div>
                    <div className="bg-gray-50 border border-gray-200 p-2 rounded font-mono text-xs dark:bg-gray-950/20 dark:border-gray-800">
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
      <div className="flex items-center gap-2 p-2 border-b bg-muted">
        <Code2 className="w-3 h-3" />
        <span className="font-medium text-xs">{title}</span>
      </div>
      <div 
        ref={isOriginal ? originalScrollRef : fixedScrollRef}
        className="overflow-auto flex-1 min-h-0"
        onScroll={(e) => handleScroll(e, !!isOriginal)}
        style={{ height: 'calc(100% - 40px)' }}
      >
        <pre className="text-xs font-mono whitespace-pre-wrap break-words" style={{ lineHeight: '28px', margin: 0, padding: 0 }}>
          <code className="block">
            {code ? (
              isOriginal !== undefined ? (
                <div>
                  {highlightDifferencesWithActions(code, isOriginal)}
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
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0 flex flex-col">
        <DialogHeader className="p-3 pb-2 border-b flex-shrink-0">
          <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Eye className="w-4 h-4" />
              <span className="text-sm">Code Fix Review</span>
              {summary && (
                <span className="text-xs text-muted-foreground">
                  ({summary.accepted_count} accepted, {summary.rejected_count} rejected, {summary.pending_count} pending)
                </span>
              )}
            </div>
            <div className="flex gap-1 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={resetReview}
                className="flex items-center gap-1 text-xs h-7"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 p-3 space-y-3">
          {/* Navigation and Bulk Action Controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-muted rounded-lg gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={navigateToPreviousChange}
                disabled={!currentFix || getActualChangedFixes().findIndex(f => f.line_key === currentFix.line_key) <= 0}
                className="text-xs h-7"
              >
                <ChevronLeft className="w-3 h-3" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={navigateToNextChange}
                disabled={!currentFix || getActualChangedFixes().findIndex(f => f.line_key === currentFix.line_key) >= getActualChangedFixes().length - 1}
                className="text-xs h-7"
              >
                Next
                <ChevronRight className="w-3 h-3" />
              </Button>
              {currentFix && (
                <span className="text-xs text-muted-foreground">
                  Change {getActualChangedFixes().findIndex(f => f.line_key === currentFix.line_key) + 1} of {getActualChangedFixes().length}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRejectAll}
                disabled={getActualChangedFixes().filter(f => f.status === 'pending').length === 0}
                className="text-red-600 hover:text-red-700 text-xs h-7"
              >
                <XIcon className="w-3 h-3 mr-1" />
                Reject All
              </Button>
              <Button
                size="sm"
                onClick={handleAcceptAll}
                disabled={getActualChangedFixes().filter(f => f.status === 'pending').length === 0}
                className="bg-green-600 hover:bg-green-700 text-xs h-7"
              >
                <Check className="w-3 h-3 mr-1" />
                Accept All
              </Button>
            </div>
          </div>

          {/* Code Diff View */}
          <div className="flex-1 min-h-0">
            <Tabs defaultValue="inline" className="w-full h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 flex-shrink-0 h-8">
                <TabsTrigger value="inline" className="text-xs">Inline Review</TabsTrigger>
                <TabsTrigger value="diff" className="text-xs">Diff View</TabsTrigger>
                <TabsTrigger value="original" className="text-xs">Original</TabsTrigger>
                <TabsTrigger value="fixed" className="text-xs">Fixed</TabsTrigger>
              </TabsList>

              <TabsContent value="inline" className="flex-1 mt-2 min-h-0">
                <div className="h-[calc(100vh-280px)] overflow-auto border rounded-lg">
                  <div className="p-3">
                    {renderInlineDiffView()}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="diff" className="flex-1 mt-2 min-h-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-[calc(100vh-280px)] border rounded-lg overflow-hidden">
                  <div className="h-full flex flex-col">
                    <div className="flex items-center gap-2 p-2 border-b bg-muted">
                      <Code2 className="w-3 h-3" />
                      <span className="font-medium text-xs">Original Code</span>
                    </div>
                    <div 
                      ref={originalScrollRef}
                      className="overflow-auto h-[calc(100vh-320px)]"
                      onScroll={(e) => handleScroll(e, true)}
                    >
                      <pre className="text-xs font-mono whitespace-pre-wrap break-words" style={{ lineHeight: '28px', margin: 0, padding: 0 }}>
                        <code className="block">
                          {originalCode ? (
                            <div>
                              {highlightDifferencesWithActions(originalCode, true)}
                            </div>
                          ) : (
                            'Loading...'
                          )}
                        </code>
                      </pre>
                    </div>
                  </div>
                  <div className="border-t lg:border-t-0 lg:border-l h-full flex flex-col">
                    <div className="flex items-center gap-2 p-2 border-b bg-muted">
                      <Code2 className="w-3 h-3" />
                      <span className="font-medium text-xs">Fixed Code (Accepted Changes Only)</span>
                    </div>
                    <div 
                      ref={fixedScrollRef}
                      className="overflow-auto h-[calc(100vh-320px)]"
                      onScroll={(e) => handleScroll(e, false)}
                    >
                      <pre className="text-xs font-mono whitespace-pre-wrap break-words" style={{ lineHeight: '28px', margin: 0, padding: 0 }}>
                        <code className="block">
                          {fixedCode ? (
                            <div>
                              {highlightDifferencesWithActions(fixedCode, false)}
                            </div>
                          ) : (
                            'Loading...'
                          )}
                        </code>
                      </pre>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="original" className="flex-1 mt-2 min-h-0">
                <div className="h-[calc(100vh-280px)] border rounded-lg overflow-hidden">
                  {renderCodeBlock(originalCode, "Original Code")}
                </div>
              </TabsContent>

              <TabsContent value="fixed" className="flex-1 mt-2 min-h-0">
                <div className="h-[calc(100vh-280px)] border rounded-lg overflow-hidden">
                  {renderCodeBlock(fixedCode, "Fixed Code (Accepted Changes Only)")}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center pt-3 border-t gap-2 flex-shrink-0">
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto text-xs h-8">
              Close
            </Button>
            <Button 
              onClick={downloadAcceptedFixes}
              disabled={isLoading || (summary?.accepted_count === 0)}
              className="w-full sm:w-auto text-xs h-8"
            >
              <Download className="w-3 h-3 mr-1" />
              {isLoading ? 'Processing...' : `Download (${summary?.accepted_count || 0})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
