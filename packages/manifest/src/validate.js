import { parseManifest, locateLine, pointerToPath, pathToDisplay } from './parse.js';
import { compileValidator } from './schema.js';
import { loadCatalogue, suggestScope } from './catalogue.js';

let cachedValidator = null;
function validator() {
  if (!cachedValidator) cachedValidator = compileValidator();
  return cachedValidator;
}

const SEMANTIC_RE = /\/(triggers|activities|localData|conditions)\/additionalProperties\/allOf\//;

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
    // Name the two allOf branches apart, or a naturalKeyField misuse sends the author to the wrong field.
    if (/\/activities\/additionalProperties\/allOf\/6\//.test(err.schemaPath)) {
      return {
        path,
        rule: 'attachments-require-queued-client-key',
        message: `activity '${name}' declares attachments but is not a server_write with idempotency 'client_key' and offlineReplayable true — attached files are uploaded before the write is sent and replayed under the caller's own key.`,
      };
    }
    if (/\/activities\/additionalProperties\/allOf\/5\//.test(err.schemaPath)) {
      return {
        path,
        rule: 'keep-refused-requires-offline-replay',
        message: `activity '${name}' declares keepRefused but is not offlineReplayable — only a write that waited in the offline queue can be refused after the caller moved on, so the declaration would do nothing.`,
      };
    }
    if (/\/activities\/additionalProperties\/allOf\/4\//.test(err.schemaPath)) {
      return {
        path,
        rule: 'hold-unsettled-requires-client-key',
        message: `activity '${name}' declares holdUnsettled but is not a server_write with idempotency 'client_key' and offlineReplayable false — a held write is sent again only under its own key, by a check again.`,
      };
    }
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
  if (/\/properties\/conditions\/additionalProperties\/allOf\//.test(err.schemaPath)) {
    return {
      path,
      rule: 'freshness-needs-held-first',
      message: `condition '${name}' declares freshness without heldFirst: true — freshness describes a held answer, and without heldFirst nothing is held.`,
    };
  }
  if (/\/localData\/additionalProperties\/allOf\/1\//.test(err.schemaPath)) {
    return {
      path,
      rule: 'persist-requires-max-rows',
      message: `localData store '${name}' sets persist:true but does not set maxRows — a persisted store on the 50000 default keeps every window ever viewed on the user's disk. Size it as rows-per-window x windows-retained.`,
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
      if (path[0] === 'localData' && path[2] === 'indexes' && path[path.length - 1] === 'unique') {
        return {
          path,
          rule: 'unique-index-unsupported',
          message: `localData store '${path[1]}' declares a unique index — unique indexes are not supported on device stores; the server enforces uniqueness. Remove 'unique: true'.`,
        };
      }
      return { path, rule: 'invalid-const', message: `${display} must be ${JSON.stringify(err.params.allowedValue)}.` };
    default:
      return { path, rule: err.keyword, message: `${display} ${err.message}.` };
  }
}

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

// Each `attachments.fields` entry names a top-level array argument; the host reads refs only from those arrays.
function attachmentFieldErrors(doc, lineCounter, data) {
  const errors = [];
  for (const [name, activity] of Object.entries(data?.activities ?? {})) {
    const fields = activity?.attachments?.fields;
    if (!Array.isArray(fields)) continue;
    const properties = activity?.inputSchema?.properties ?? {};
    for (const field of fields) {
      if ([].concat(properties[field]?.type ?? []).includes('array')) continue;
      errors.push(finalize(doc, lineCounter, {
        path: ['activities', name, 'attachments', 'fields'],
        rule: 'attachments-fields-are-arrays',
        message: `activity '${name}' attachments field '${field}' is not a top-level array argument of its inputSchema.`,
      }, 2));
    }
  }
  return errors;
}

// JSON Schema cannot compare items, so ascending retry steps are checked here.
function retryStepErrors(doc, lineCounter, data) {
  const errors = [];
  for (const [name, cond] of Object.entries(data?.conditions ?? {})) {
    const steps = cond?.freshness?.retryAfterMs;
    if (!Array.isArray(steps)) continue;
    if (steps.some((step, i) => i > 0 && !(Number(step) > Number(steps[i - 1])))) {
      errors.push(finalize(doc, lineCounter, {
        path: ['conditions', name, 'freshness', 'retryAfterMs'],
        rule: 'retry-steps-ascending',
        message: `condition '${name}' freshness.retryAfterMs must ascend: each retry waits longer than the one before.`,
      }, 2));
    }
  }
  return errors;
}

function crossRefErrors(doc, lineCounter, data) {
  const errors = [];
  const subjectPanels = new Set(Array.isArray(data.panels) ? data.panels.map((panel) => panel.id) : Object.keys(data.panels ?? {}));
  for (const [index, panelId] of (data.subjectCapabilities?.client_access?.panelIds ?? []).entries()) {
    if (!subjectPanels.has(panelId)) {
      errors.push(finalize(doc, lineCounter, {
        path: ['subjectCapabilities', 'client_access', 'panelIds', index],
        rule: 'unresolved-subject-panel',
        message: `client_access references panel '${panelId}', which is not declared by this Mini Program.`,
      }, 4));
    }
  }
  const triggers = new Set(Object.keys(data.triggers ?? {}));
  const conditions = new Set(Object.keys(data.conditions ?? {}));
  const activities = new Set(Object.keys(data.activities ?? {}));
  const functions = new Set(Object.keys(data.functions ?? {}));
  const scopes = new Set(data.permissions?.scopes ?? []);
  const interactionTriggers = new Set(
    (data.contributions?.interactions ?? []).map((i) => `ui.${i.id}`),
  );
  const dataResolvable = new Set([...conditions, ...activities, ...triggers, ...scopes]);

  const resolveTarget = (actionName, target, path) => {
    if (!target || target.mp || target.skip) return;
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

  // The broker builds the key as `n-${value}`, so a non-scalar field makes every invocation collide silently.
  for (const [name, act] of Object.entries(data.activities ?? {})) {
    if (act.idempotency === 'natural_key' && act.naturalKeyField === undefined) {
      errors.push(
        finalize(doc, lineCounter, {
          path: ['activities', name, 'idempotency'],
          rule: 'natural-key-requires-field',
          message: `activity '${name}' declares idempotency 'natural_key' but no naturalKeyField — the broker falls back to hashing the whole args, which IS 'derived_from_input'. Declare the identity field, or declare 'derived_from_input' and say what it actually does.`,
        }, 4),
      );
    }
  }

  for (const [name, act] of Object.entries(data.activities ?? {})) {
    const field = act.naturalKeyField;
    if (typeof field !== 'string' || field.includes('.')) continue;
    // Beside another strategy the field is already refused by name; a second complaint would mislead.
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

export function validateManifest(source, opts = {}) {
  const { doc, data, lineCounter, yamlErrors } = parseManifest(source);

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

  shape.push(...retryStepErrors(doc, lineCounter, data));
  shape.push(...attachmentFieldErrors(doc, lineCounter, data));
  if (shape.length > 0) return { ok: false, manifestId, errors: shape };

  // Qualified per-primitive scopes are addressed by the owning MP's manifest, not the catalogue.
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

  const xref = crossRefErrors(doc, lineCounter, data);
  if (xref.length > 0) return { ok: false, manifestId, errors: xref };

  const semantic = ajvErrors
    .filter(isSemantic)
    .map((e) => finalize(doc, lineCounter, describeSemantic(e), 5));
  const strictActive = opts.strictAi || data.publisher?.type === 'ai_authored';
  const strict = strictActive ? aiStrictErrors(doc, lineCounter, data) : [];
  const last = dedupe([...semantic, ...strict]);
  if (last.length > 0) return { ok: false, manifestId, errors: last };

  return { ok: true, manifestId, errors: [] };
}
