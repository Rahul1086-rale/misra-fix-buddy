import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MisraViolation {
  id: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file: string;
  line: number;
  column?: number;
  category: string;
  description?: string;
  fixed?: boolean;
  suggestion?: string;
}

interface ViolationsListProps {
  violations: MisraViolation[];
  selectedViolation?: string;
  onViolationSelect: (id: string) => void;
  onFixViolation?: (id: string) => void;
}

export const ViolationsList = ({ 
  violations, 
  selectedViolation, 
  onViolationSelect, 
  onFixViolation 
}: ViolationsListProps) => {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'destructive';
      case 'warning':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <AlertTriangle className="h-4 w-4" />;
      case 'warning':
        return <Clock className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const groupedViolations = violations.reduce((acc, violation) => {
    const key = violation.file;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(violation);
    return acc;
  }, {} as Record<string, MisraViolation[]>);

  return (
    <Card className="p-6 h-full bg-gradient-to-br from-card to-card/80 border-border/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          MISRA Violations
          <Badge variant="outline" className="ml-2">
            {violations.length}
          </Badge>
        </h3>
      </div>

      <div className="space-y-4 max-h-[600px] overflow-y-auto">
        {Object.entries(groupedViolations).map(([file, fileViolations]) => (
          <div key={file} className="space-y-2">
            <div className="flex items-center gap-2 px-2 py-1 bg-accent/30 rounded-md">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{file}</span>
              <Badge variant="outline" className="ml-auto">
                {fileViolations.length}
              </Badge>
            </div>
            
            {fileViolations.map((violation) => (
              <div
                key={violation.id}
                className={cn(
                  "p-4 rounded-lg border cursor-pointer transition-all duration-200",
                  selectedViolation === violation.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/50 hover:bg-accent/30",
                  violation.fixed && "opacity-60"
                )}
                onClick={() => onViolationSelect(violation.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={getSeverityColor(violation.severity) as any}
                        className="text-xs"
                      >
                        {getSeverityIcon(violation.severity)}
                        {violation.severity.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {violation.rule}
                      </Badge>
                      {violation.fixed && (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Fixed
                        </Badge>
                      )}
                    </div>
                    
                    <p className="text-sm font-medium text-foreground">
                      {violation.message}
                    </p>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Line {violation.line}</span>
                      {violation.column && <span>Column {violation.column}</span>}
                      <span className="px-2 py-1 bg-accent/50 rounded">
                        {violation.category}
                      </span>
                    </div>

                    {violation.suggestion && (
                      <div className="mt-2 p-2 bg-success/10 border border-success/20 rounded text-xs">
                        <p className="text-success-foreground">
                          <strong>Suggested fix:</strong> {violation.suggestion}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {onFixViolation && !violation.fixed && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFixViolation(violation.id);
                      }}
                      className="text-xs"
                    >
                      Fix
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
        
        {violations.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No MISRA violations found</p>
            <p className="text-sm">Upload an Excel report to see violations</p>
          </div>
        )}
      </div>
    </Card>
  );
};