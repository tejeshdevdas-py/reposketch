export interface Repository {
  owner: string;
  name: string;
  fullName: string;
  description: string;
  defaultBranch: string;
  commit: string;
  url: string;
  stars: number;
  isDemo?: boolean;
}

export type ImportKind = 'import' | 'export' | 'dynamic' | 'require';
export interface Reference {
  specifier: string;
  line: number;
  kind: ImportKind;
  typeOnly: boolean;
  target?: string;
  external?: boolean;
}

export interface FileNode {
  id: string;
  path: string;
  name: string;
  directory: string;
  source: string;
  lines: number;
  imports: Reference[];
  entryReason?: string;
  url?: string;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  line: number;
  kind: ImportKind;
  typeOnly: boolean;
}

export interface Analysis {
  repository: Repository;
  files: FileNode[];
  edges: Edge[];
  warnings: string[];
  stats: {
    files: number;
    connections: number;
    packages: number;
    unresolved: number;
    lines: number;
  };
}
