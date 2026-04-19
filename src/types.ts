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

export interface Rule {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  check(files: ScannedFile[]): Finding[];
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
