// `tommy manifest …` CLI (cli-spec.md).
// Exit codes — 0 success · 1 a checkable failure (invalid manifest / unknown
// scope) · 2 usage / IO error. CI and review-cli branch on these; AI agents
// branch on --json `ok`.

import { writeFileSync, mkdirSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { validateFile } from './validate.js';
import { typegenFromSource } from './typegen.js';
import { readFileSync } from 'node:fs';
import { loadCatalogue, searchCatalogue } from './catalogue.js';

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.exitCode = EXIT_USAGE;
  }
}

function parseFlags(args, spec) {
  const flags = {};
  const positional = [];
  // A value must not itself look like a flag — otherwise `-o --watch` would
  // silently treat `--watch` as the output dir.
  const readValue = (i, label) => {
    const v = args[i];
    if (v === undefined || (v.startsWith('-') && v !== '-')) {
      throw new UsageError(`flag ${label} needs a value`);
    }
    return v;
  };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const def = spec[key];
      if (!def) throw new UsageError(`unknown flag --${key}`);
      if (def === 'boolean') flags[key] = true;
      else {
        i += 1;
        flags[key] = readValue(i, `--${key}`);
      }
    } else if (a.startsWith('-') && a !== '-') {
      const alias = a.length === 2 ? { o: 'out' }[a[1]] : undefined;
      if (!alias) throw new UsageError(`unknown flag ${a}`); // e.g. -xy, -oo
      i += 1;
      flags[alias] = readValue(i, a);
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function formatReport(result, path) {
  if (result.ok) return `✔ ${basename(path)} — valid (${result.manifestId ?? 'no id'})`;
  const lines = [`✖ ${basename(path)} — ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}\n`];
  for (const e of result.errors) {
    lines.push(`  line ${e.line}  ${e.path}  [${e.rule}]`);
    lines.push(`    ${e.message}`);
    if (e.suggestion) lines.push(`    Did you mean '${e.suggestion}'?`);
    lines.push('');
  }
  return lines.join('\n');
}

function cmdValidate(args, io) {
  const { flags, positional } = parseFlags(args, {
    json: 'boolean',
    catalogue: 'string',
    'strict-ai': 'boolean',
  });
  const path = positional[0];
  if (!path) throw new UsageError('usage: tommy manifest validate <path> [--json] [--catalogue <path>] [--strict-ai]');

  let result;
  try {
    result = validateFile(path, { cataloguePath: flags.catalogue, strictAi: flags['strict-ai'] });
  } catch (e) {
    // Any filesystem error (ENOENT/EISDIR/EACCES/…) is a usage/IO failure (exit 2)
    // reported in the SAME { ok, manifestId, errors } shape as a validation result.
    if (e && typeof e.code === 'string' && e.code.startsWith('E')) {
      const msg =
        e.code === 'ENOENT' ? `file not found: ${path}`
          : e.code === 'EISDIR' ? `not a file: ${path}`
            : `cannot read ${path}: ${e.message}`;
      if (flags.json) {
        io.out(JSON.stringify({ ok: false, manifestId: null, errors: [{ line: 0, path: '(io)', rule: 'io-error', message: msg }] }));
      } else {
        io.err(`✖ ${msg}`);
      }
      return EXIT_USAGE;
    }
    throw e;
  }

  if (flags.json) {
    io.out(JSON.stringify({ ok: result.ok, manifestId: result.manifestId, errors: result.errors }));
  } else {
    io.out(formatReport(result, path));
  }
  return result.ok ? EXIT_OK : EXIT_FAIL;
}

async function cmdTypegen(args, io) {
  const { flags, positional } = parseFlags(args, { out: 'string', watch: 'boolean' });
  const path = positional[0];
  if (!path) throw new UsageError('usage: tommy manifest typegen <path> [-o <dir>] [--watch]');
  if (flags.watch) throw new UsageError('--watch is not implemented in this release');

  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch (e) {
    io.err(`✖ file not found: ${path}`);
    return EXIT_USAGE;
  }

  let dts;
  let id;
  try {
    const { parseManifest } = await import('./parse.js');
    id = parseManifest(source).data?.id ?? basename(path).replace(/\.[^.]+$/, '');
    dts = await typegenFromSource(source);
  } catch (e) {
    io.err(`✖ ${e.message}`);
    return EXIT_FAIL;
  }

  const outDir = flags.out ?? dirname(path);
  const outPath = join(outDir, `${id}.contracts.d.ts`);
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, dts, 'utf8');
  } catch (e) {
    io.err(`✖ cannot write ${outPath}: ${e.message}`);
    return EXIT_USAGE;
  }
  io.out(`✔ wrote ${outPath}`);
  return EXIT_OK;
}

function cmdCatalogue(args, io) {
  const { flags } = parseFlags(args, { search: 'string', category: 'string', json: 'boolean', catalogue: 'string' });
  const catalogue = loadCatalogue(flags.catalogue);
  const list = searchCatalogue(catalogue, { search: flags.search, category: flags.category });
  if (flags.json) {
    io.out(JSON.stringify({ catalogueVersion: catalogue.version, permissions: list }));
    return EXIT_OK;
  }
  io.out(`permission catalogue ${catalogue.version} — ${list.length} scope${list.length === 1 ? '' : 's'}\n`);
  for (const p of list) {
    io.out(`  ${p.scope.padEnd(28)} ${p.category.padEnd(12)} ${p.sensitivity.padEnd(7)} ${p.title}`);
  }
  return EXIT_OK;
}

function cmdExplain(args, io) {
  const { flags, positional } = parseFlags(args, { catalogue: 'string' });
  const scope = positional[0];
  if (!scope) throw new UsageError('usage: tommy manifest explain <scope>');
  const catalogue = loadCatalogue(flags.catalogue);
  const p = catalogue.byScope.get(scope);
  if (!p) {
    io.err(`✖ '${scope}' is not in the permission catalogue (${catalogue.version}).`);
    return EXIT_FAIL;
  }
  io.out(`${p.scope}`);
  io.out(`  title:       ${p.title}`);
  io.out(`  category:    ${p.category}`);
  io.out(`  sensitivity: ${p.sensitivity}`);
  if (p.deviceCapabilityRequired) io.out(`  device:      ${p.deviceCapabilityRequired}`);
  io.out(`  description: ${p.description}`);
  const attention = { low: 'routine', medium: 'reviewed', high: 'heightened review attention' }[p.sensitivity] ?? 'reviewed';
  io.out(`  review:      ${attention}`);
  return EXIT_OK;
}

/**
 * Run the CLI. `argv` excludes node + script (i.e. process.argv.slice(2)).
 * @returns {Promise<number>} exit code
 */
export async function run(argv, io = { out: console.log, err: console.error }) {
  try {
    if (argv[0] !== 'manifest') {
      throw new UsageError('usage: tommy manifest <validate|typegen|catalogue|explain> …');
    }
    const sub = argv[1];
    const rest = argv.slice(2);
    switch (sub) {
      case 'validate':
        return cmdValidate(rest, io);
      case 'typegen':
        return await cmdTypegen(rest, io);
      case 'catalogue':
        return cmdCatalogue(rest, io);
      case 'explain':
        return cmdExplain(rest, io);
      default:
        throw new UsageError('usage: tommy manifest <validate|typegen|catalogue|explain> …');
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(e.message);
      return e.exitCode;
    }
    io.err(`✖ ${e.stack ?? e.message}`);
    return EXIT_USAGE;
  }
}
