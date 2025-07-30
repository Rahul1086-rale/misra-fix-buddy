import * as XLSX from 'xlsx';
import { MisraViolation } from '@/components/ViolationsList';

interface ExcelRow {
  [key: string]: any;
}

export class ExcelParser {
  static parseViolationReport(file: File): Promise<MisraViolation[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get the first sheet
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Convert to JSON
          const jsonData: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);
          
          // Parse violations from the Excel data
          const violations = this.parseViolationsFromJson(jsonData);
          resolve(violations);
        } catch (error) {
          reject(new Error('Failed to parse Excel file: ' + (error as Error).message));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read Excel file'));
      };
      
      reader.readAsArrayBuffer(file);
    });
  }

  private static parseViolationsFromJson(data: ExcelRow[]): MisraViolation[] {
    const violations: MisraViolation[] = [];
    
    data.forEach((row, index) => {
      try {
        // Try different common column name variations
        const rule = this.extractValue(row, ['Rule', 'MISRA Rule', 'rule', 'Rule ID', 'RuleID', 'misra_rule']);
        const message = this.extractValue(row, ['Message', 'Description', 'message', 'description', 'Error Message', 'Violation']);
        const file = this.extractValue(row, ['File', 'Filename', 'file', 'filename', 'Source File', 'Path']);
        const line = this.extractNumericValue(row, ['Line', 'Line Number', 'line', 'line_number', 'LineNo']);
        const column = this.extractNumericValue(row, ['Column', 'Col', 'column', 'col', 'Column Number']);
        const severity = this.extractValue(row, ['Severity', 'Level', 'severity', 'level', 'Priority', 'Type']);
        const category = this.extractValue(row, ['Category', 'Group', 'category', 'group', 'Class']);

        // Skip rows that don't have essential information
        if (!rule || !message || !file || !line) {
          return;
        }

        const violation: MisraViolation = {
          id: `violation-${index}-${rule}-${line}`,
          rule: String(rule),
          severity: this.normalizeSeverity(String(severity)),
          message: String(message),
          file: String(file),
          line: Number(line),
          column: column ? Number(column) : undefined,
          category: String(category || 'General'),
          description: this.extractValue(row, ['Detail', 'Details', 'detail', 'details', 'Full Description']),
          fixed: false
        };

        // Generate AI suggestion based on rule and message
        violation.suggestion = this.generateSuggestion(violation);

        violations.push(violation);
      } catch (error) {
        console.warn(`Failed to parse row ${index}:`, error);
      }
    });

    return violations;
  }

  private static extractValue(row: ExcelRow, possibleKeys: string[]): any {
    for (const key of possibleKeys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        return row[key];
      }
    }
    return null;
  }

  private static extractNumericValue(row: ExcelRow, possibleKeys: string[]): number | null {
    const value = this.extractValue(row, possibleKeys);
    if (value === null) return null;
    
    const num = Number(value);
    return isNaN(num) ? null : num;
  }

  private static normalizeSeverity(severity: string): 'error' | 'warning' | 'info' {
    const normalizedSeverity = severity.toLowerCase();
    
    if (normalizedSeverity.includes('error') || normalizedSeverity.includes('critical') || normalizedSeverity.includes('high')) {
      return 'error';
    } else if (normalizedSeverity.includes('warning') || normalizedSeverity.includes('medium')) {
      return 'warning';
    } else {
      return 'info';
    }
  }

  private static generateSuggestion(violation: MisraViolation): string {
    const rule = violation.rule.toLowerCase();
    const message = violation.message.toLowerCase();

    // Basic rule-based suggestions
    if (rule.includes('2.1') || message.includes('unreachable code')) {
      return 'Remove unreachable code statements after return, break, or continue statements';
    }
    
    if (rule.includes('2.2') || message.includes('dead code')) {
      return 'Remove dead code or unused variables and functions';
    }
    
    if (rule.includes('8.2') || message.includes('function declaration')) {
      return 'Add proper function parameter names in declarations';
    }
    
    if (rule.includes('8.4') || message.includes('compatible declaration')) {
      return 'Ensure function declarations are compatible across all files';
    }
    
    if (rule.includes('9.1') || message.includes('uninitialized')) {
      return 'Initialize variables before use';
    }
    
    if (rule.includes('10.1') || message.includes('implicit conversion')) {
      return 'Add explicit type casting to avoid implicit conversions';
    }
    
    if (rule.includes('11.1') || message.includes('pointer conversion')) {
      return 'Use proper pointer type casting with explicit casts';
    }
    
    if (rule.includes('12.1') || message.includes('operator precedence')) {
      return 'Add parentheses to clarify operator precedence';
    }
    
    if (rule.includes('14.3') || message.includes('controlling expression')) {
      return 'Ensure controlling expressions are not invariant';
    }
    
    if (rule.includes('16.1') || message.includes('switch')) {
      return 'Add proper break statements or fall-through comments in switch cases';
    }
    
    if (rule.includes('17.1') || message.includes('variadic')) {
      return 'Avoid using variadic functions or use them with proper type checking';
    }
    
    if (rule.includes('20.1') || message.includes('include')) {
      return 'Place #include directives at the top of the file before any other code';
    }
    
    if (rule.includes('21.1') || message.includes('reserved identifier')) {
      return 'Avoid using reserved identifiers or standard library names';
    }

    // Default suggestion
    return 'Review the code according to MISRA C guidelines and apply appropriate fix';
  }
}