// Types for the node-only entry '@tommy/manifest/node'.
import type { ValidateOptions, ValidationResult, CliIO } from './index.d.ts';

export function validateFile(path: string, opts?: ValidateOptions): ValidationResult;
export function typegenFromManifest(data: unknown): Promise<string>;
export function typegenFromSource(source: string): Promise<string>;
export function runCli(argv: string[], io?: CliIO): Promise<number>;
