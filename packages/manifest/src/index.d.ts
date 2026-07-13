// Public type surface for @tommy/manifest. The Manifest shape is generated from
// the vendored schema (src/generated/manifest.ts, `yarn typegen`); the API types
// below are hand-authored to match src/index.js.

export type { TommyMiniProgramManifest as Manifest } from './generated/manifest.js';

export interface ValidationError {
  /** 1-based source line the error anchors to. */
  line: number;
  /** dotted display path, e.g. "permissions.scopes[1]". */
  path: string;
  /** the named rule that was broken (the AI-authoring contract). */
  rule: string;
  message: string;
  /** validation layer 1..5 (yaml → schema → catalogue → cross-ref → semantic). */
  layer?: number;
  /** "did you mean" fix hint, where one is available. */
  suggestion?: string;
}

export interface ValidationResult {
  ok: boolean;
  manifestId: string | null;
  errors: ValidationError[];
}

export interface ValidateOptions {
  /** path to a specific permission-catalogue JSON (default: the bundled one). */
  cataloguePath?: string;
  /** apply the AI-authored stricter rules (auto-on when publisher.type is ai_authored). */
  strictAi?: boolean;
}

export interface CatalogueEntry {
  scope: string;
  category: string;
  title: string;
  description: string;
  sensitivity: 'low' | 'medium' | 'high';
  deviceCapabilityRequired?: string;
}

export interface Catalogue {
  version: string;
  categories: string[];
  permissions: CatalogueEntry[];
  scopes: Set<string>;
  byScope: Map<string, CatalogueEntry>;
}

export interface CatalogueQuery {
  search?: string;
  category?: string;
}

export interface CliIO {
  out: (line: string) => void;
  err: (line: string) => void;
}

export function validateManifest(source: string, opts?: ValidateOptions): ValidationResult;
export function parseManifest(source: string): {
  doc: unknown;
  data: unknown;
  lineCounter: unknown;
  yamlErrors: Array<{ line: number; col: number; message: string }>;
};
export function loadSchema(): Record<string, unknown>;
export function loadCatalogue(path?: string): Catalogue;
export function searchCatalogue(catalogue: Catalogue, query?: CatalogueQuery): CatalogueEntry[];
export function suggestScope(catalogue: Catalogue, unknown: string): string | null;
