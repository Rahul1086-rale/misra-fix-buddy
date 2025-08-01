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

  // Group consecutive line changes for better UX
  const getLineGroups = () => {
    const groups: { [key: string]: string[] } = {};
    
    Object.keys(codeSnippets).forEach(lineKey => {
      const baseLineMatch = lineKey.match(/^(\d+)/);
      if (baseLineMatch) {
        const baseLine = baseLineMatch[1];
        if (!groups[baseLine]) {
          groups[baseLine] = [];
        }
        groups[baseLine].push(lineKey);
      }
    });
    
    return groups;
  };

  // Create aligned diff view that maintains line correspondence
  const createAlignedDiff = (originalCode: string, fixedCode: string) => {
    if (!originalCode || !fixedCode || !codeSnippets) {
      return {
        originalLines: originalCode?.split('\n') || [],
        fixedLines: fixedCode?.split('\n') || [],
        lineMapping: new Map()
      };
    }

    const originalLines = originalCode.split('\n');
    const alignedOriginal: (string | null)[] = [];
    const alignedFixed: (string | null)[] = [];
    const lineMapping = new Map(); // Maps visual line index to original line number

    // Sort snippet keys by line number
    const sortedSnippetKeys = Object.keys(codeSnippets).sort((a, b) => {
      const aNum = parseInt(a.match(/^(\d+)/)?.[1] || '0');
      const bNum = parseInt(b.match(/^(\d+)/)?.[1] || '0');
      if (aNum !== bNum) return aNum - bNum;
      return a.localeCompare(b);
    });

    // Group snippets by base line number
    const lineGroups = new Map();
    sortedSnippetKeys.forEach(lineKey => {
      const baseLineNum = parseInt(lineKey.match(/^(\d+)/)?.[1] || '0');
      if (!lineGroups.has(baseLineNum)) {
        lineGroups.set(baseLineNum, []);
      }
      lineGroups.get(baseLineNum).push(lineKey);
    });

    let currentVisualIndex = 0;
    let processedOriginalLines = new Set();

    // Process each line group
    for (let originalLineNum = 1; originalLineNum <= originalLines.length; originalLineNum++) {
      const originalContent = originalLines[originalLineNum - 1];
      
      if (lineGroups.has(originalLineNum)) {
        const lineKeys = lineGroups.get(originalLineNum);
        
        // Process each change in this line group
        for (const lineKey of lineKeys) {
          const changeType = getLineChangeType(lineKey, originalLines);
          const isNewLine = /[a-z]$/.test(lineKey);
          
          if (isNewLine) {
            // New line - only appears in fixed side
            alignedOriginal.push(null);
            alignedFixed.push(codeSnippets[lineKey] || '');
            lineMapping.set(currentVisualIndex, originalLineNum);
          } else {
            // Original line modification/deletion
            if (changeType.type === 'deleted') {
              // Deleted line - appears in original but not in fixed
              alignedOriginal.push(originalContent);
              alignedFixed.push(null);
            } else {
              // Modified line or unchanged line with snippet
              alignedOriginal.push(originalContent);
              alignedFixed.push(codeSnippets[lineKey] || originalContent);
            }
            lineMapping.set(currentVisualIndex, originalLineNum);
            processedOriginalLines.add(originalLineNum);
          }
          currentVisualIndex++;
        }
      } else {
        // No changes for this line - unchanged
        alignedOriginal.push(originalContent);
        alignedFixed.push(originalContent);
        lineMapping.set(currentVisualIndex, originalLineNum);
        processedOriginalLines.add(originalLineNum);
        currentVisualIndex++;
      }
    }

    return {
      originalLines: alignedOriginal,
      fixedLines: alignedFixed,
      lineMapping
    };
  };

  const highlightDifferencesWithActions = (originalLines: (string | null)[], fixedLines: (string | null)[], isOriginal: boolean) => {
    if (!originalCode || !fixedCode || !codeSnippets) return [];
    
    const linesToRender = isOriginal ? originalLines : fixedLines;
    const lineGroups = getLineGroups();
    
    return linesToRender.map((line, visualIndex) => {
      let className = '';
      let lineKey = '';
      let primaryFix: Fix | undefined;
      let relatedLineKeys: string[] = [];
      let hasActualChanges = false;
      let showButtons = false;

      // Find all snippets that might affect this visual line
      let candidateLineKeys: string[] = [];
      
      if (line !== null) {
        // For each snippet, check if it could map to this visual line
        Object.keys(codeSnippets).forEach(key => {
          const baseLineNum = parseInt(key.match(/^(\d+)/)?.[1] || '0');
          const isNewLine = /[a-z]$/.test(key);
          
          // Count how many lines before this visual index are from the same base line or earlier
          let linesFromSameOrEarlierBase = 0;
          for (let i = 0; i <= visualIndex; i++) {
            const lineAtIndex = isOriginal ? originalLines[i] : fixedLines[i];
            if (lineAtIndex !== null) {
              // Check all snippets that could contribute to this line
              Object.keys(codeSnippets).forEach(checkKey => {
                const checkBaseLineNum = parseInt(checkKey.match(/^(\d+)/)?.[1] || '0');
                if (checkBaseLineNum <= baseLineNum) {
                  // This could be a contributing line
                }
              });
            }
          }
          
          // For now, use a simpler approach based on visual line position
          // Find the snippet that is most likely to correspond to this visual line
          if (baseLineNum >= 1 && baseLineNum <= originalCode.split('\n').length) {
            candidateLineKeys.push(key);
          }
        });
        
        // Find the most appropriate line key for this visual position
        if (candidateLineKeys.length > 0) {
          // Sort by relevance and pick the best match
          candidateLineKeys.sort((a, b) => {
            const aNum = parseInt(a.match(/^(\d+)/)?.[1] || '0');
            const bNum = parseInt(b.match(/^(\d+)/)?.[1] || '0');
            return aNum - bNum;
          });
          
          // For simplicity, map by trying to find a snippet near this visual line
          const searchStart = Math.max(1, visualIndex - 2);
          const searchEnd = Math.min(originalCode.split('\n').length, visualIndex + 3);
          
          for (let searchLine = searchStart; searchLine <= searchEnd; searchLine++) {
            const searchKey = searchLine.toString();
            if (codeSnippets[searchKey] !== undefined) {
              lineKey = searchKey;
              break;
            }
            // Also check for suffixed versions (e.g., "123a")
            for (const suffix of ['a', 'b', 'c', 'd', 'e']) {
              const suffixedKey = searchLine + suffix;
              if (codeSnippets[suffixedKey] !== undefined) {
                lineKey = suffixedKey;
                break;
              }
            }
            if (lineKey) break;
          }
        }

        if (lineKey) {
          const baseLineMatch = lineKey.match(/^(\d+)/);
          if (baseLineMatch) {
            const baseLine = baseLineMatch[1];
            relatedLineKeys = lineGroups[baseLine] || [lineKey];
            const allRelatedFixes = relatedLineKeys.map(key => fixes.find(f => f.line_key === key)).filter(Boolean) as Fix[];
            primaryFix = allRelatedFixes[0];

            hasActualChanges = relatedLineKeys.some(key => {
              const changeType = getLineChangeType(key, originalCode.split('\n'));
              return changeType.type !== 'unchanged';
            });
          }
        }
      }

      // Apply styling based on line type and requirements
      if (line === null) {
        if (isOriginal) {
          // Missing line in original (added line) - gray placeholder
          className = 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600';
          line = '(new line)';
        } else {
          // Missing line in fixed (deleted line) - gray placeholder
          className = 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600';
          line = '(deleted line)';
        }
      } else {
        // Determine line type based on changes
        let lineType = 'unchanged';
        
        if (hasActualChanges && relatedLineKeys.length > 0) {
          const changeTypes = relatedLineKeys.map(key => getLineChangeType(key, originalCode.split('\n')).type);
          
          if (changeTypes.includes('deleted')) {
            lineType = 'deleted';
          } else if (changeTypes.includes('added')) {
            lineType = 'added';
          } else if (changeTypes.includes('modified')) {
            lineType = 'modified';
          }
        }

        // Apply colors according to requirements:
        // - deleted: red on both sides
        // - modified: red on original side, yellow on fixed side  
        // - newLine: green on fixed side, no code snippet on original side
        switch (lineType) {
          case 'deleted':
            className = 'bg-red-50 border-l-2 border-l-red-400 dark:bg-red-950/20 dark:border-l-red-500';
            break;
          case 'modified':
            className = isOriginal 
              ? 'bg-red-50 border-l-2 border-l-red-400 dark:bg-red-950/20 dark:border-l-red-500'
              : 'bg-yellow-50 border-l-2 border-l-yellow-400 dark:bg-yellow-950/20 dark:border-l-yellow-500';
            break;
          case 'added':
            // New lines only appear on fixed side and are green
            if (!isOriginal) {
              className = 'bg-green-50 border-l-2 border-l-green-400 dark:bg-green-950/20 dark:border-l-green-500';
            }
            break;
        }

        // Show inline controls only on fixed side as requested
        showButtons = hasActualChanges && !!primaryFix && !isOriginal;
      }
      
      return (
        <div key={visualIndex} className={`${className} px-2 py-0.5 group relative`}>
          <div className="flex items-center justify-between">
            <span className="flex-1 font-mono text-xs">
              {line}
            </span>
            {showButtons && primaryFix && (
              <div className="flex gap-1 ml-2 shrink-0">
                {primaryFix.status === 'pending' ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReviewAction(primaryFix.line_key, 'reject')}
                      className="text-red-600 hover:text-red-700 h-6 px-2 text-xs"
                    >
                      <XIcon className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleReviewAction(primaryFix.line_key, 'accept')}
                      className="bg-green-600 hover:bg-green-700 h-6 px-2 text-xs"
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge 
                      variant={primaryFix.status === 'accepted' ? 'default' : 'destructive'}
                      className="text-xs h-6 cursor-default"
                    >
                      {primaryFix.status}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSingleLineReset(primaryFix.line_key)}
                      className="h-6 px-2 text-xs"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
            )}
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
                
                {fix && (
                  <div className="flex gap-2">
                    {fix.status === 'pending' ? (
                      <>
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
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSingleLineReset(lineKey)}
                        className="text-gray-600 hover:text-gray-700"
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Reset
                      </Button>
                    )}
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

  const renderCodeBlock = (code: string, title: string, isOriginal?: boolean) => {
    const alignedDiff = createAlignedDiff(originalCode, fixedCode);
    const linesToRender = isOriginal ? alignedDiff.originalLines : alignedDiff.fixedLines;
    
    return (
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
                    {highlightDifferencesWithActions(alignedDiff.originalLines, alignedDiff.fixedLines, isOriginal)}
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
  };

  const currentFix = fixes[currentFixIndex];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] w-[95vw] p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Code Fix Review
              {summary && (
                <span className="text-sm text-muted-foreground">
                  ({summary.accepted_count} accepted, {summary.rejected_count} rejected, {summary.pending_count} pending)
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetReview}
                className="flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Navigation and Bulk Action Controls */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={navigateToPreviousChange}
                disabled={!currentFix || getActualChangedFixes().findIndex(f => f.line_key === currentFix.line_key) <= 0}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={navigateToNextChange}
                disabled={!currentFix || getActualChangedFixes().findIndex(f => f.line_key === currentFix.line_key) >= getActualChangedFixes().length - 1}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
              {currentFix && (
                <span className="text-sm text-muted-foreground ml-2">
                  Change {getActualChangedFixes().findIndex(f => f.line_key === currentFix.line_key) + 1} of {getActualChangedFixes().length}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRejectAll}
                disabled={getActualChangedFixes().filter(f => f.status === 'pending').length === 0}
                className="text-red-600 hover:text-red-700"
              >
                <XIcon className="w-4 h-4 mr-1" />
                Reject All
              </Button>
              <Button
                size="sm"
                onClick={handleAcceptAll}
                disabled={getActualChangedFixes().filter(f => f.status === 'pending').length === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="w-4 h-4 mr-1" />
                Accept All
              </Button>
            </div>
          </div>

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
