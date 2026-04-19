export type Severity = 'high' | 'medium' | 'low' | 'info';
export type FailOn = 'high' | 'medium' | 'low' | 'none';

export interface Finding {
  ruleId: string;
  severity: Severity;
  title: string;
  why: string;
  fix: string[];
  references: string[];
  file?: string;
  line?: number;
  column?: number;
  message?: string;
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
  failOn?: FailOn;
}

export interface DrAgentConfig {
  rules?: Record<string, Severity | 'off'>;
  ignorePaths?: string[];
  failOn?: FailOn;
}
