// The 5-layer manifest validator (README §Validation layers).
// Layers run in order; the FIRST failing layer stops the pipeline. Every error
// carries { line, path, rule, message, suggestion? } — the named-rule contract
// that lets an AI author correct and resubmit autonomously.
//
//   1. YAML         — well-formed, readable YAML.
//   2. Schema       — Ajv 2020-12 vs manifest-schema.json (shape errors).
//   3. Catalogue    — every permissions.scopes entry is a catalogue member.
//   4. Cross-ref    — actions' trigger/conditions/activity + panels'
//                     dataRequirements resolve to declared primitives.
//   5. Semantic     — the schema's allOf if/then rules (offline-replay ⇒
//                     idempotency, debounced ⇒ debounceMs, custom sync ⇒
//                     resolver), plus --strict-ai rules.

import { parseManifest, locateLine, pointerToPath, pathToDisplay } from './parse.js';
import { compileValidator } from './schema.js';
import { loadCatalogue, suggestScope } from './catalogue.js';

let cachedValidator = null;
function validator() {
  if (!cachedValidator) cachedValidator = compileValidator();
  return cachedValidator;
}

// --- Ajv error → named-rule descriptor ------------------------------------

const SEMANTIC_RE = /\/(triggers|activities|localData)\/additionalProperties\/allOf\//;

function isSemantic(err) {
  return SEMANTIC_RE.test(err.schemaPath);
}

function describeSemantic(err) {
  const path = pointerToPath(err.instancePath);
  const name = path[1];
  if (err.schemaPath.includes('/triggers/')) {
    return {
      path,
      rule: 'debounced-requires-debounceMs',
      message: `trigger '${name}' uses emission 'debounced' but does not set debounceMs.`,
    };
  }
  if (err.schemaPath.includes('/activities/')) {
    // The activities block has TWO allOf branches; index 1 is the L22
    // naturalKeyField guard. Naming them apart matters — reporting a
    // naturalKeyField misuse as an offline-replay error would send the author
    // to edit the wrong field.
    if (/\/activities\/additionalProperties\/allOf\/1\//.test(err.schemaPath)) {
      return {
        path,
        rule: 'natural-key-field-requires-natural-key',
        message: `activity '${name}' declares naturalKeyField but its idempotency is not 'natural_key' — the broker only reads the field on the natural_key branch, so the declaration would silently do nothing.`,
      };
    }
    return {
      path,
      rule: 'offline-replay-requires-idempotency',
      message: `activity '${name}' is offlineReplayable but idempotency is 'none' — an offline-replayable activity must have an idempotency strategy.`,
    };
  }
  return {
    path,
    rule: 'custom-sync-requires-resolver',
    message: `localData store '${name}' uses syncStrategy 'custom' but does not set customResolverActivity.`,
  };
}

function describeShape(err) {
  const path = pointerToPath(err.instancePath);
  const display = pathToDisplay(path);
  const value = () => (typeof err.data === 'object' ? JSON.stringify(err.data) : String(err.data));

  switch (err.keyword) {
    case 'required':
      return {
        path,
        rule: 'missing-required-field',
        message: `missing required field '${err.params.missingProperty}' at ${display}.`,
      };
    case 'additionalProperties':
      return {
        path,
        key: err.params.additionalProperty,
        display: pathToDisplay([...path, err.params.additionalProperty]),
        rule: 'unknown-field',
        message: `unknown field '${err.params.additionalProperty}' — not allowed here (additionalProperties: false).`,
      };
    case 'enum':
      return {
        path,
        rule: 'invalid-enum-value',
        message: `${value()} at ${display} is not one of: ${err.params.allowedValues.join(', ')}.`,
      };
    case 'type':
      return {
        path,
        rule: 'invalid-type',
        message: `${display} must be ${err.params.type}.`,
      };
    case 'pattern':
      if (display.startsWith('permissions.scopes')) {
        return {
          path,
          rule: 'malformed-scope',
          message: `${value()} is not a valid scope — expected verb:resource with verb in read|write|invoke.`,
        };
      }
      return { path, rule: 'pattern-mismatch', message: `${display} does not match the required pattern.` };
    case 'format':
      return { path, rule: 'invalid-format', message: `${value()} at ${display} is not a valid ${err.params.format}.` };
    case 'uniqueItems':
      return { path, rule: 'duplicate-item', message: `${display} contains duplicate items.` };
    case 'const':
      return { path, rule: 'invalid-const', message: `${display} must be ${JSON.stringify(err.params.allowedValue)}.` };
    default:
      return { path, rule: err.keyword, message: `${display} ${err.message}.` };
  }
}

/** Collapse identical errors — Ajv emits both the `if` and `then` error for a
 *  failing if/then branch, which describeSemantic maps to one rule. */
function dedupe(errors) {
  const seen = new Set();
  return errors.filter((e) => {
    const key = `${e.rule}|${e.path}|${e.line}|${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function finalize(doc, lineCounter, d, layer, suggestion) {
  const display = d.display ?? pathToDisplay(d.path);
  return {
    line: locateLine(doc, lineCounter, d.path, d.key != null ? { key: d.key } : {}),
    path: display,
    rule: d.rule,
    message: d.message,
    layer,
    ...(suggestion ? { suggestion } : {}),
  };
}

// --- Cross-reference layer -------------------------------------------------

function crossRefErrors(doc, lineCounter, data) {
  const errors = [];
  const triggers = new Set(Object.keys(data.triggers ?? {}));
  const conditions = new Set(Object.keys(data.conditions ?? {}));
  const activities = new Set(Object.keys(data.activities ?? {}));
  const functions = new Set(Object.keys(data.functions ?? {}));
  const scopes = new Set(data.permissions?.scopes ?? []);
  const interactionTriggers = new Set(
    (data.contributions?.interactions ?? []).map((i) => `ui.${i.id}`),
  );
  // dataRequirements resolves to a declared condition/activity/trigger OR a
  // declared permission scope (the schema documents "conditions/scopes").
  const dataResolvable = new Set([...conditions, ...activities, ...triggers, ...scopes]);

  // Resolve one activity target ({name} local, {mp,name} external, {computed})
  // against the declared primitives, pushing the right named error if it dangles.
  const resolveTarget = (actionName, target, path) => {
    if (!target || target.mp || target.skip) return; // external or a skip branch
    if (target.computed != null) {
      if (!functions.has(target.computed)) {
        errors.push(
          finalize(doc, lineCounter, {
            path: [...path, 'computed'],
            rule: 'unresolved-computed-function',
            message: `action '${actionName}' references computed function '${target.computed}', which is not declared in this MP's functions:.`,
          }, 4),
        );
      }
      return;
    }
    if (target.name != null && !activities.has(target.name)) {
      errors.push(
        finalize(doc, lineCounter, {
          path: [...path, 'name'],
          rule: 'unresolved-activity',
          message: `action '${actionName}' references activity '${target.name}', which is not declared in this MP (and is not mp:-qualified or computed).`,
        }, 4),
      );
    }
  };

  // --- naturalKeyField must name a SCALAR property of the inputSchema -------
  //
  // The broker builds the key as `n-${value}` (broker.js idempotencyKeyFor), a
  // template literal. So a field pointing at an OBJECT stringifies to
  // `n-[object Object]` and an ARRAY to `n-a,b` — every invocation collides,
  // and the second distinct write replays the first's stored result instead of
  // applying. That is the M3 `set_mileage_status` approve→reject failure
  // exactly, and it is SILENT: no error, a plausible key, the wrong answer.
  //
  // The schema can say `naturalKeyField` is a string; it cannot say the string
  // must name a scalar property of a sibling object, which is why this lives in
  // the cross-reference layer. Naming a property that does not exist at all is
  // also caught here — the broker would fall back to whole-args derivation, so
  // the declaration would be decoration rather than the contract it looks like.
  //
  // Dotted paths are ACCEPTED without inspection: `a.b` addresses a nested
  // property whose type the inputSchema often does not spell out, and refusing
  // what cannot be checked would be worse than allowing it.
  for (const [name, act] of Object.entries(data.activities ?? {})) {
    const field = act.naturalKeyField;
    if (typeof field !== 'string' || field.includes('.')) continue;
    // Beside another strategy the field is already refused by name
    // (natural-key-field-requires-natural-key). Adding a second complaint about
    // a field the broker will never read would send the author to the wrong fix.
    if (act.idempotency !== 'natural_key') continue;
    const props = act.inputSchema?.properties;
    if (!props || typeof props !== 'object') continue;
    const prop = props[field];
    if (prop === undefined) {
      errors.push(
        finalize(doc, lineCounter, {
          path: ['activities', name, 'naturalKeyField'],
          rule: 'natural-key-field-not-in-input',
          message: `activity '${name}' declares naturalKeyField '${field}', which is not a property of its inputSchema — the broker would find nothing there and silently fall back to hashing the whole args, so the declaration promises a contract it does not deliver.`,
        }, 4),
      );
      continue;
    }
    if (prop.type === 'object' || prop.type === 'array') {
      errors.push(
        finalize(doc, lineCounter, {
          path: ['activities', name, 'naturalKeyField'],
          rule: 'natural-key-field-not-scalar',
          message: `activity '${name}' declares naturalKeyField '${field}', which is an ${prop.type} — the broker interpolates the value into the key, so every call would collide on the same string and the second distinct write would replay the first's result. A natural key must be a scalar identity.`,
        }, 4),
      );
    }
  }

  for (const [name, action] of Object.entries(data.actions ?? {})) {
    const trig = action.trigger;
    if (trig && !trig.mp && trig.name != null) {
      if (!triggers.has(trig.name) && !interactionTriggers.has(trig.name)) {
        errors.push(
          finalize(doc, lineCounter, {
            path: ['actions', name, 'trigger', 'name'],
            rule: 'unresolved-trigger',
            message: `action '${name}' references trigger '${trig.name}', which is not a declared trigger or interaction in this MP (and is not mp:-qualified).`,
          }, 4),
        );
      }
    }
    (action.conditions ?? []).forEach((cond, idx) => {
      if (cond?.mp || cond?.name == null) return;
      if (!conditions.has(cond.name)) {
        errors.push(
          finalize(doc, lineCounter, {
            path: ['actions', name, 'conditions', idx, 'name'],
            rule: 'unresolved-condition',
            message: `action '${name}' references condition '${cond.name}', which is not declared in this MP (and is not mp:-qualified).`,
          }, 4),
        );
      }
    });
    // Activity: single target, E4 select-branch list, or E2.2 §4 computed ref.
    const act = action.activity;
    if (act) {
      if (Array.isArray(act.select)) {
        act.select.forEach((branch, bi) =>
          resolveTarget(name, branch, ['actions', name, 'activity', 'select', bi]),
        );
      } else {
        resolveTarget(name, act, ['actions', name, 'activity']);
      }
    }
  }

  (data.panels ?? []).forEach((panel, pi) => {
    (panel.dataRequirements ?? []).forEach((req, ri) => {
      if (!dataResolvable.has(req)) {
        errors.push(
          finalize(doc, lineCounter, {
            path: ['panels', pi, 'dataRequirements', ri],
            rule: 'unresolved-data-requirement',
            message: `panel '${panel.id ?? pi}' requires data '${req}', which resolves to no declared condition/activity/trigger or requested scope.`,
          }, 4),
        );
      }
    });
  });

  return errors;
}

// --- --strict-ai layer -----------------------------------------------------

function aiStrictErrors(doc, lineCounter, data) {
  const errors = [];
  for (const [name, act] of Object.entries(data.activities ?? {})) {
    if (['server_write', 'external_call'].includes(act.sideEffect) && act.idempotency === 'none') {
      errors.push(
        finalize(doc, lineCounter, {
          path: ['activities', name, 'idempotency'],
          rule: 'ai-strict-write-needs-idempotency',
          message: `[strict-ai] activity '${name}' has sideEffect '${act.sideEffect}' but idempotency 'none' — AI-authored MPs must give server/external writes a retry-safe idempotency strategy.`,
        }, 5),
      );
    }
  }
  return errors;
}

/**
 * Validate a manifest source string.
 * @param {string} source
 * @param {{ catalogueOverride?: object, strictAi?: boolean }} [opts]
 * @returns {{ ok: boolean, manifestId: string|null, errors: Array }}
 */
export function validateManifest(source, opts = {}) {
  const { doc, data, lineCounter, yamlErrors } = parseManifest(source);

  // Layer 1 — YAML
  if (yamlErrors.length > 0) {
    return {
      ok: false,
      manifestId: null,
      errors: yamlErrors.map((e) => ({
        line: e.line,
        path: '(yaml)',
        rule: 'yaml-syntax',
        message: e.message,
        layer: 1,
      })),
    };
  }

  const manifestId = data?.id ?? null;
  const validate = validator();
  validate(data);
  const ajvErrors = validate.errors ?? [];

  const shape = dedupe(
    ajvErrors.filter((e) => !isSemantic(e)).map((e) => finalize(doc, lineCounter, describeShape(e), 2)),
  );

  // Layer 2 — Schema shape
  if (shape.length > 0) return { ok: false, manifestId, errors: shape };

  // Layer 3 — Catalogue
  //
  // The QUALIFIED per-primitive form (`verb:<mpId>.<primitive>`, e.g.
  // invoke:team-comms.send_message) is exempt: it is addressed by the OWNING
  // MP's manifest, not by the fixed catalogue, so catalogue membership is not
  // the right question to ask of it. Layer 2's pattern already constrains its
  // shape, and layer 4 (cross-reference) is where a qualified scope naming a
  // primitive nobody publishes should be caught.
  //
  // This exemption is not new policy — it is the grammar catching up with what
  // is already enforced at runtime. A cross-MP invoke has no domain derivation:
  // the broker's authorizeInvoke and the server's InvokeExecutor both require
  // exactly `invoke:<owner>.<activity>`, so that string is the ONLY way a
  // manifest can declare the authority it needs. tommy-api's own checker
  // (Mp::ManifestCheck M08/M02) has always skipped catalogue membership for
  // this form; the schema and this layer were the last two places still
  // rejecting it, which is why the seven live cross-MP wirings had to be
  // granted out of band by seed data instead of declared.
  const catalogue = loadCatalogue(opts.catalogueOverride ?? opts.cataloguePath);
  const isQualified = (scope) => /^(read|write|invoke):[a-z][a-z0-9-]*\.[a-z][a-z0-9_]*$/.test(scope);
  const cat = [];
  (data.permissions?.scopes ?? []).forEach((scope, idx) => {
    if (!isQualified(scope) && !catalogue.scopes.has(scope)) {
      const suggestion = suggestScope(catalogue, scope);
      cat.push(
        finalize(
          doc,
          lineCounter,
          {
            path: ['permissions', 'scopes', idx],
            rule: 'permission-not-in-catalogue',
            message: `'${scope}' is not in the permission catalogue (${catalogue.version}).`,
          },
          3,
          suggestion,
        ),
      );
    }
  });
  if (cat.length > 0) return { ok: false, manifestId, errors: cat };

  // Layer 4 — Cross-reference
  const xref = crossRefErrors(doc, lineCounter, data);
  if (xref.length > 0) return { ok: false, manifestId, errors: xref };

  // Layer 5 — Semantic (schema allOf) + strict-ai
  const semantic = ajvErrors
    .filter(isSemantic)
    .map((e) => finalize(doc, lineCounter, describeSemantic(e), 5));
  const strictActive = opts.strictAi || data.publisher?.type === 'ai_authored';
  const strict = strictActive ? aiStrictErrors(doc, lineCounter, data) : [];
  const last = dedupe([...semantic, ...strict]);
  if (last.length > 0) return { ok: false, manifestId, errors: last };

  return { ok: true, manifestId, errors: [] };
}
