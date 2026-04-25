export type Severity = 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  ruleId: string;
  severity: Severity;
  title: string;
  why: string;
  fix: string[];
  references: string[];
  file?: string;
  line?: number;
}

export interface RuleContext {
  scanRoot: string; // absolute path of the scanned directory
}

export interface Rule {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  check(files: ScannedFile[], ctx?: RuleContext): Finding[];
}

export interface ScannedFile {
  path: string;
  content: string;
  lines: string[];
}

export interface RunOptions {
  json?: boolean;
  severity?: Severity;
  rules?: string[];
}
