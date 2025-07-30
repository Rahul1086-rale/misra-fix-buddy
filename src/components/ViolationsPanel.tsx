import React from 'react';
import { CheckSquare, Square, AlertTriangle, Info, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppContext } from '@/context/AppContext';

export default function ViolationsPanel() {
  const { state, dispatch } = useAppContext();

  const toggleViolation = (line: number) => {
    dispatch({ type: 'TOGGLE_VIOLATION', payload: line.toString() });
  };

  const selectAll = () => {
    state.violations.forEach(violation => {
      if (!violation.selected) {
        toggleViolation(violation.line);
      }
    });
  };

  const selectNone = () => {
    state.violations.forEach(violation => {
      if (violation.selected) {
        toggleViolation(violation.line);
      }
    });
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
      <Card>
        <CardHeader>
          <CardTitle>MISRA Violations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No violations found</p>
            <p className="text-sm">Upload an Excel report to see violations</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedCount = state.violations.filter(v => v.selected).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>MISRA Violations ({state.violations.length})</CardTitle>
          <Badge variant="outline">
            {selectedCount} selected
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={selectAll}
            disabled={selectedCount === state.violations.length}
          >
            <CheckSquare className="w-3 h-3 mr-1" />
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={selectNone}
            disabled={selectedCount === 0}
          >
            <Square className="w-3 h-3 mr-1" />
            Select None
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {state.violations.map((violation, index) => (
            <div
              key={`${violation.file}-${violation.line}-${violation.misra}-${index}`}
              className={`group relative p-4 border rounded-xl cursor-pointer transition-all duration-200 ${
                violation.selected 
                  ? 'bg-gradient-to-r from-primary/10 to-primary/5 border-primary/50 shadow-sm' 
                  : 'hover:bg-muted/50 hover:border-border'
              }`}
              onClick={() => toggleViolation(violation.line)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <Checkbox
                    checked={violation.selected || false}
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
              {violation.selected && (
                <div className="absolute top-2 right-2">
                  <CheckSquare className="w-4 h-4 text-primary" />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}