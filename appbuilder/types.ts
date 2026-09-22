// JARVIS App Builder — isolated add-on. No existing JARVIS code is imported or modified.
export type AppKind = 'calculator' | 'tictactoe';

export interface AppSpec {
  kind: AppKind;
  name: string;
  theme: 'dark' | 'light' | 'jarvis';
  features: string[];
  rawRequest: string;
}

export interface BuildStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

export interface BuildResult {
  success: boolean;
  partial?: boolean;
  projectDir: string;
  version: number;
  testsPassed: number;
  testsFailed: number;
  errors: string[];
  entryFile: string;
  message: string;
}

export interface ManagedApp {
  id: string;
  name: string;
  kind: AppKind;
  dir: string;
  version: number;
  status: 'built' | 'failed' | 'building';
  createdAt: number;
}
