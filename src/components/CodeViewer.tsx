import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, Download, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { MisraViolation } from './ViolationsList';

interface CodeViewerProps {
  code: string;
  fileName: string;
  violations: MisraViolation[];
  selectedViolation?: string;
  fixedCode?: string;
  onDownload?: () => void;
  onReset?: () => void;
}

export const CodeViewer = ({ 
  code, 
  fileName, 
  violations, 
  selectedViolation,
  fixedCode,
  onDownload,
  onReset
}: CodeViewerProps) => {
  const { toast } = useToast();
  
  const lines = (fixedCode || code).split('\n');
  const violationLines = new Set(violations.map(v => v.line));
  const selectedViolationLine = violations.find(v => v.id === selectedViolation)?.line;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(fixedCode || code);
      toast({
        title: "Copied to clipboard",
        description: "Code has been copied to your clipboard",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy code to clipboard",
        variant: "destructive",
      });
    }
  };

  const downloadCode = () => {
    if (onDownload) {
      onDownload();
    } else {
      const blob = new Blob([fixedCode || code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Card className="p-6 h-full bg-gradient-to-br from-card to-card/80 border-border/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">{fileName}</h3>
          {fixedCode && (
            <Badge variant="outline" className="bg-success/10 text-success border-success/30">
              Fixed Version
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={copyToClipboard}
            className="text-xs"
          >
            <Copy className="h-4 w-4 mr-1" />
            Copy
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={downloadCode}
            className="text-xs"
          >
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
          {fixedCode && onReset && (
            <Button
              size="sm"
              variant="outline"
              onClick={onReset}
              className="text-xs"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        <div className="bg-code-bg rounded-lg border border-border/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-accent/30 border-b border-border/50">
            <span className="text-sm font-mono text-muted-foreground">{fileName}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {lines.length} lines
              </span>
              {violations.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {violations.length} violations
                </Badge>
              )}
            </div>
          </div>
          
          <div className="overflow-auto max-h-[500px]">
            <div className="flex">
              {/* Line numbers */}
              <div className="bg-accent/20 p-4 text-right border-r border-border/50 select-none">
                {lines.map((_, index) => (
                  <div
                    key={index + 1}
                    className={cn(
                      "text-xs font-mono leading-6 text-code-lineNumbers",
                      violationLines.has(index + 1) && "text-destructive font-semibold",
                      selectedViolationLine === index + 1 && "text-primary font-bold"
                    )}
                  >
                    {index + 1}
                  </div>
                ))}
              </div>
              
              {/* Code content */}
              <div className="flex-1 p-4">
                {lines.map((line, index) => {
                  const lineNumber = index + 1;
                  const hasViolation = violationLines.has(lineNumber);
                  const isSelected = selectedViolationLine === lineNumber;
                  
                  return (
                    <div
                      key={lineNumber}
                      className={cn(
                        "text-sm font-mono leading-6 relative",
                        hasViolation && "bg-gradient-to-r from-code-violation to-transparent",
                        isSelected && "bg-primary/10 border-l-2 border-primary pl-2"
                      )}
                    >
                      <code className="text-foreground whitespace-pre">
                        {line || ' '}
                      </code>
                      {hasViolation && (
                        <div className="absolute right-2 top-0">
                          <Badge variant="destructive" className="text-xs px-1 py-0">
                            !
                          </Badge>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        
        {code.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-code-bg/50 rounded-lg">
            <p className="text-muted-foreground">Upload a C/C++ file to view code</p>
          </div>
        )}
      </div>
    </Card>
  );
};