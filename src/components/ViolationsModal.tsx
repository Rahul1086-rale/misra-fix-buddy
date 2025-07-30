import React, { useState } from 'react';
import { CheckSquare, Square, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppContext } from '@/context/AppContext';

interface ViolationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ViolationsModal({ isOpen, onClose }: ViolationsModalProps) {
  const { state, dispatch } = useAppContext();
  const [tempSelectedViolations, setTempSelectedViolations] = useState<Set<string>>(
    new Set(state.selectedViolations.map(v => v.line.toString()))
  );

  const toggleViolation = (line: number) => {
    const lineStr = line.toString();
    const newSelected = new Set(tempSelectedViolations);
    if (newSelected.has(lineStr)) {
      newSelected.delete(lineStr);
    } else {
      newSelected.add(lineStr);
    }
    setTempSelectedViolations(newSelected);
  };

  const selectAll = () => {
    const allLines = new Set(state.violations.map(v => v.line.toString()));
    setTempSelectedViolations(allLines);
  };

  const selectNone = () => {
    setTempSelectedViolations(new Set());
  };

  const confirmSelection = () => {
    // Update violations with selection status
    const updatedViolations = state.violations.map(v => ({
      ...v,
      selected: tempSelectedViolations.has(v.line.toString())
    }));
    
    dispatch({ type: 'SET_VIOLATIONS', payload: updatedViolations });
    
    // Update selected violations
    const selectedViolations = updatedViolations.filter(v => v.selected);
    dispatch({ type: 'SET_SELECTED_VIOLATIONS', payload: selectedViolations });
    
    onClose();
  };

  const getSeverityIcon = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
      case 'required':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
      case 'advisory':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
      case 'required':
        return 'destructive';
      case 'warning':
      case 'advisory':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (state.violations.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>MISRA Violations</DialogTitle>
          </DialogHeader>
          <div className="text-center text-muted-foreground py-8">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No violations found</p>
            <p className="text-sm">Upload an Excel report to see violations</p>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle>MISRA Violations ({state.violations.length})</DialogTitle>
            <Badge variant="outline">
              {tempSelectedViolations.size} selected
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
              disabled={tempSelectedViolations.size === state.violations.length}
            >
              <CheckSquare className="w-3 h-3 mr-1" />
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={selectNone}
              disabled={tempSelectedViolations.size === 0}
            >
              <Square className="w-3 h-3 mr-1" />
              Select None
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {state.violations.map((violation, index) => (
            <div
              key={`${violation.file}-${violation.line}-${violation.misra}-${index}`}
              className={`group relative p-4 border rounded-xl cursor-pointer transition-all duration-200 ${
                tempSelectedViolations.has(violation.line.toString())
                  ? 'bg-gradient-to-r from-primary/10 to-primary/5 border-primary/50 shadow-sm' 
                  : 'hover:bg-muted/50 hover:border-border'
              }`}
              onClick={() => toggleViolation(violation.line)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <Checkbox
                    checked={tempSelectedViolations.has(violation.line.toString())}
                    onCheckedChange={() => toggleViolation(violation.line)}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    {getSeverityIcon(violation.level)}
                    <Badge 
                      variant={getSeverityColor(violation.level) as any} 
                      className="text-xs font-medium"
                    >
                      {violation.level}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      Line {violation.line}
                    </Badge>
                    <Badge variant="outline" className="text-xs font-mono">
                      {violation.misra}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-foreground font-medium mb-2 leading-relaxed">
                    {violation.warning}
                  </p>
                  
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/30"></div>
                    <p className="text-xs text-muted-foreground truncate">
                      {violation.file} • {violation.path}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Selection indicator */}
              {tempSelectedViolations.has(violation.line.toString()) && (
                <div className="absolute top-2 right-2">
                  <CheckSquare className="w-4 h-4 text-primary" />
                </div>
              )}
            </div>
          ))}
        </div>
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirmSelection}>
            Confirm Selection ({tempSelectedViolations.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}