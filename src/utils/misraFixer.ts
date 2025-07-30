import { MisraViolation } from '@/components/ViolationsList';

export class MisraFixer {
  static async fixViolation(code: string, violation: MisraViolation): Promise<string> {
    const lines = code.split('\n');
    const violationLine = violation.line - 1; // Convert to 0-based index
    
    if (violationLine < 0 || violationLine >= lines.length) {
      return code; // Invalid line number
    }

    const currentLine = lines[violationLine];
    const rule = violation.rule.toLowerCase();
    
    let fixedLine = currentLine;
    
    // Apply specific fixes based on MISRA rules
    if (rule.includes('2.1')) {
      // Remove unreachable code
      if (this.isUnreachableCode(lines, violationLine)) {
        fixedLine = ''; // Remove the line
      }
    }
    
    else if (rule.includes('8.2')) {
      // Add parameter names to function declarations
      fixedLine = this.addParameterNames(currentLine);
    }
    
    else if (rule.includes('9.1')) {
      // Initialize variables
      fixedLine = this.initializeVariable(currentLine);
    }
    
    else if (rule.includes('10.1')) {
      // Add explicit type casting
      fixedLine = this.addExplicitCasting(currentLine);
    }
    
    else if (rule.includes('11.1')) {
      // Fix pointer conversions
      fixedLine = this.fixPointerConversion(currentLine);
    }
    
    else if (rule.includes('12.1')) {
      // Add parentheses for operator precedence
      fixedLine = this.addParentheses(currentLine);
    }
    
    else if (rule.includes('16.1')) {
      // Add break statements in switch cases
      if (this.needsBreakStatement(lines, violationLine)) {
        fixedLine = currentLine + '\n    break;';
      }
    }
    
    else if (rule.includes('20.1')) {
      // Move #include to top
      if (currentLine.trim().startsWith('#include')) {
        // Remove from current position and add to top
        lines.splice(violationLine, 1);
        lines.unshift(currentLine);
        return lines.join('\n');
      }
    }

    // Replace the line if it was modified
    if (fixedLine !== currentLine) {
      lines[violationLine] = fixedLine;
    }

    return lines.join('\n');
  }

  static async fixAllViolations(code: string, violations: MisraViolation[]): Promise<string> {
    let fixedCode = code;
    
    // Sort violations by line number in descending order to avoid line number shifts
    const sortedViolations = [...violations].sort((a, b) => b.line - a.line);
    
    for (const violation of sortedViolations) {
      if (!violation.fixed) {
        fixedCode = await this.fixViolation(fixedCode, violation);
      }
    }
    
    return fixedCode;
  }

  private static isUnreachableCode(lines: string[], lineIndex: number): boolean {
    // Check if previous lines contain return, break, continue, etc.
    for (let i = lineIndex - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.includes('return') || line.includes('break') || line.includes('continue')) {
        return true;
      }
      if (line.includes('{') || line.includes('}')) {
        break; // Different scope
      }
    }
    return false;
  }

  private static addParameterNames(line: string): string {
    // Simple regex to add parameter names to function declarations
    // This is a basic implementation - real-world would need more sophisticated parsing
    return line.replace(/\(([^)]*)\)/, (match, params) => {
      if (params.trim() === '') return match;
      
      const paramList = params.split(',').map((param: string, index: number) => {
        const trimmed = param.trim();
        // If parameter doesn't have a name (only type), add one
        if (!trimmed.includes(' ') || trimmed.endsWith('*')) {
          return `${trimmed} param${index + 1}`;
        }
        return param;
      });
      
      return `(${paramList.join(', ')})`;
    });
  }

  private static initializeVariable(line: string): string {
    // Initialize variables at declaration
    const patterns = [
      { regex: /(\w+\s+\w+);/, replacement: '$1 = 0;' },
      { regex: /(\w+\s*\*\s*\w+);/, replacement: '$1 = NULL;' },
      { regex: /(char\s+\w+\[\d*\]);/, replacement: '$1 = {0};' }
    ];
    
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        return line.replace(pattern.regex, pattern.replacement);
      }
    }
    
    return line;
  }

  private static addExplicitCasting(line: string): string {
    // Add explicit type casting for common implicit conversions
    // This is a simplified implementation
    return line.replace(/=\s*(\w+)\s*\+\s*(\w+)/, '= (int)($1 + $2)');
  }

  private static fixPointerConversion(line: string): string {
    // Fix pointer type conversions
    return line.replace(/=\s*\(void\s*\*\)/, '= (void *)');
  }

  private static addParentheses(line: string): string {
    // Add parentheses around complex expressions
    // This is a basic implementation
    const operatorPattern = /(\w+)\s*([+\-*/])\s*(\w+)\s*([+\-*/])\s*(\w+)/;
    
    if (operatorPattern.test(line)) {
      return line.replace(operatorPattern, '($1 $2 $3) $4 $5');
    }
    
    return line;
  }

  private static needsBreakStatement(lines: string[], lineIndex: number): boolean {
    const currentLine = lines[lineIndex].trim();
    const nextLine = lineIndex + 1 < lines.length ? lines[lineIndex + 1].trim() : '';
    
    // Check if current line is a case statement and next line is not break or case/default
    if (currentLine.includes('case ') || currentLine.includes('default:')) {
      return false; // Don't add break to case/default declaration
    }
    
    // Check if we're in a case block and there's no break before next case
    if (!nextLine.startsWith('break') && 
        !nextLine.startsWith('case ') && 
        !nextLine.startsWith('default:') &&
        !nextLine.includes('}')) {
      // Look ahead to see if there's a case or default coming
      for (let i = lineIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('case ') || line.startsWith('default:')) {
          return true; // Need break before next case
        }
        if (line.includes('}')) {
          break; // End of switch
        }
      }
    }
    
    return false;
  }
}