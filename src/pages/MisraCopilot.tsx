import { useState } from 'react';
import { MisraUpload } from '@/components/MisraUpload';
import { ViolationsList, MisraViolation } from '@/components/ViolationsList';
import { CodeViewer } from '@/components/CodeViewer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { ExcelParser } from '@/utils/excelParser';
import { MisraFixer } from '@/utils/misraFixer';
import { Shield, Zap, FileText, TrendingUp } from 'lucide-react';

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  content?: string;
}

export const MisraCopilot = () => {
  const [excelFile, setExcelFile] = useState<UploadedFile | undefined>();
  const [codeFile, setCodeFile] = useState<UploadedFile | undefined>();
  const [violations, setViolations] = useState<MisraViolation[]>([]);
  const [selectedViolation, setSelectedViolation] = useState<string | undefined>();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [fixedCode, setFixedCode] = useState<string | undefined>();
  const { toast } = useToast();

  const handleExcelUpload = async (file: File) => {
    setIsAnalyzing(true);
    setAnalysisProgress(20);
    
    try {
      const parsedViolations = await ExcelParser.parseViolationReport(file);
      setViolations(parsedViolations);
      setExcelFile({
        name: file.name,
        size: file.size,
        type: file.type
      });
      setAnalysisProgress(100);
      
      toast({
        title: "Analysis Complete",
        description: `Found ${parsedViolations.length} MISRA violations`,
      });
    } catch (error) {
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to parse Excel file",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
    }
  };

  const handleCodeUpload = async (file: File) => {
    try {
      const content = await file.text();
      setCodeFile({
        name: file.name,
        size: file.size,
        type: file.type,
        content
      });
      
      // Reset fixed code when new file is uploaded
      setFixedCode(undefined);
      
      toast({
        title: "Code Loaded",
        description: `${file.name} loaded successfully`,
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to read code file",
        variant: "destructive",
      });
    }
  };

  const handleFixViolation = async (violationId: string) => {
    if (!codeFile?.content) {
      toast({
        title: "No Code",
        description: "Please upload a code file first",
        variant: "destructive",
      });
      return;
    }

    const violation = violations.find(v => v.id === violationId);
    if (!violation) return;

    try {
      const currentCode = fixedCode || codeFile.content;
      const fixed = await MisraFixer.fixViolation(currentCode, violation);
      setFixedCode(fixed);
      
      // Mark violation as fixed
      setViolations(prev => prev.map(v => 
        v.id === violationId ? { ...v, fixed: true } : v
      ));
      
      toast({
        title: "Fix Applied",
        description: `Applied fix for ${violation.rule}`,
      });
    } catch (error) {
      toast({
        title: "Fix Failed",
        description: "Failed to apply automatic fix",
        variant: "destructive",
      });
    }
  };

  const handleFixAllViolations = async () => {
    if (!codeFile?.content) {
      toast({
        title: "No Code",
        description: "Please upload a code file first",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    try {
      const unfixedViolations = violations.filter(v => !v.fixed);
      const totalViolations = unfixedViolations.length;
      
      let currentCode = fixedCode || codeFile.content;
      
      for (let i = 0; i < unfixedViolations.length; i++) {
        const violation = unfixedViolations[i];
        currentCode = await MisraFixer.fixViolation(currentCode, violation);
        setAnalysisProgress(((i + 1) / totalViolations) * 100);
        
        // Small delay to show progress
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      setFixedCode(currentCode);
      
      // Mark all violations as fixed
      setViolations(prev => prev.map(v => ({ ...v, fixed: true })));
      
      toast({
        title: "All Fixes Applied",
        description: `Applied fixes for ${totalViolations} violations`,
      });
    } catch (error) {
      toast({
        title: "Batch Fix Failed",
        description: "Failed to apply all automatic fixes",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
    }
  };

  const handleResetCode = () => {
    setFixedCode(undefined);
    setViolations(prev => prev.map(v => ({ ...v, fixed: false })));
    toast({
      title: "Code Reset",
      description: "Reverted to original code",
    });
  };

  const stats = {
    total: violations.length,
    errors: violations.filter(v => v.severity === 'error').length,
    warnings: violations.filter(v => v.severity === 'warning').length,
    fixed: violations.filter(v => v.fixed).length
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              MISRA Fix Copilot
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Intelligent MISRA-C compliance checking and automated violation fixing for safer embedded software
          </p>
        </div>

        {/* Stats Cards */}
        {violations.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-gradient-to-br from-card to-card/80">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total Issues</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-card to-card/80">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-2xl font-bold text-destructive">{stats.errors}</p>
                  <p className="text-sm text-muted-foreground">Errors</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-card to-card/80">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-warning" />
                <div>
                  <p className="text-2xl font-bold text-warning">{stats.warnings}</p>
                  <p className="text-sm text-muted-foreground">Warnings</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-card to-card/80">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-success" />
                <div>
                  <p className="text-2xl font-bold text-success">{stats.fixed}</p>
                  <p className="text-sm text-muted-foreground">Fixed</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Upload Section */}
        <MisraUpload
          onExcelUpload={handleExcelUpload}
          onCodeUpload={handleCodeUpload}
          excelFile={excelFile}
          codeFile={codeFile}
        />

        {/* Progress Bar */}
        {isAnalyzing && (
          <Card className="p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {analysisProgress < 50 ? 'Analyzing violations...' : 'Applying fixes...'}
                </span>
                <span className="text-sm text-muted-foreground">{Math.round(analysisProgress)}%</span>
              </div>
              <Progress value={analysisProgress} className="w-full" />
            </div>
          </Card>
        )}

        {/* Action Buttons */}
        {violations.length > 0 && codeFile && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="text-sm">
                  {violations.filter(v => !v.fixed).length} remaining violations
                </Badge>
                {fixedCode && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                    Fixes applied
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleFixAllViolations}
                  disabled={isAnalyzing || violations.every(v => v.fixed)}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Fix All Violations
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Main Content */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Violations List */}
          <ViolationsList
            violations={violations}
            selectedViolation={selectedViolation}
            onViolationSelect={setSelectedViolation}
            onFixViolation={handleFixViolation}
          />

          {/* Code Viewer */}
          <CodeViewer
            code={codeFile?.content || ''}
            fileName={codeFile?.name || 'No file selected'}
            violations={violations}
            selectedViolation={selectedViolation}
            fixedCode={fixedCode}
            onReset={fixedCode ? handleResetCode : undefined}
          />
        </div>
      </div>
    </div>
  );
};