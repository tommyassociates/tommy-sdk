/**
 * predicate.js — THE predicate evaluator. Singular, deliberately.
 *
 * The manifest schema's `$defs/predicate` is a CLOSED L6 comparator set
 * (`exists | not_exists | equals | not_equals | one_of | range`, with one
 * level of `allOf`/`anyOf`). Its own $comment states the rule this file
 * exists to make enforceable:
 *
 *   "There is exactly ONE evaluator: an adapter that re-implements any
 *    comparison operator is the R4 drift risk and is forbidden."
 *
 * Everything that needs to evaluate a predicate — Action `when` gates,
 * `contributions.interactions` visibleWhen, and the manifest-driven settings
 * grammar's page/section/field `visibleWhen` + `readOnlyWhen` — calls THIS
 * function. Callers differ only in the CONTEXT they build: a plain bag of
 * already-resolved source values. Building that bag is a read; comparing
 * values is an operator, and operators live here and nowhere else.
 *
 * Adding an operator is a binary release (schema + this file + tests), never
 * config. That is the 2.20 §6 firewall, restated as code.
 */

/** Thrown when a predicate cannot be evaluated by THIS binary. */
export class PredicateError extends Error {
  constructor(message, { rule } = {}) {
    super(message);
    this.name = 'PredicateError';
    this.code = 'PredicateError';
    this.rule = rule || null;
  }
}

const OPERATORS = ['exists', 'not_exists', 'equals', 'not_equals', 'one_of', 'range'];

function dottedGet(obj, path) {
  if (!path) return obj;
  return String(path).split('.').reduce((acc, part) => (acc === null || acc === undefined ? undefined : acc[part]), obj);
}

/** Structural equality over the JSON value space (scalars, arrays, objects). */
function sameValue(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

const isPresent = (value) => value !== undefined && value !== null;
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Resolve ONE `$defs/inputMapSource` against the caller's context bag.
 *
 * Context shape (all optional; a missing bucket resolves to undefined, which
 * `exists` / `not_exists` are there to test):
 *   {
 *     mpId,                          // whose settings namespace is "own"
 *     setting:    { [mpId]: { key: value } },   // S5, incl. cross-MP reads
 *     condition:  { [ref]: value },
 *     serviceRead:{ [ref]: value },
 *     trigger: {}, option: {}, item: {},
 *   }
 */
export function resolveSource(source, context = {}) {
  if (!source || typeof source !== 'object') {
    throw new PredicateError('predicate source must be an object', { rule: 'source' });
  }
  if (source.transform) {
    // E2 transform chains are declared in the schema but not implemented in
    // this binary yet. Silently ignoring one would change the meaning of a
    // manifest, so refuse loudly instead.
    throw new PredicateError('predicate source transform chains are not implemented in this binary', { rule: 'transform' });
  }

  let value;
  if ('const' in source) {
    value = source.const;
  } else {
    switch (source.from) {
      case 'setting': {
        const namespace = (context.setting || {})[source.mp || context.mpId] || {};
        value = dottedGet(namespace, source.path);
        break;
      }
      case 'condition':
      case 'serviceRead': {
        const bucket = (context[source.from] || {})[source.ref];
        value = dottedGet(bucket, source.path);
        break;
      }
      case 'trigger':
      case 'option':
      case 'item':
        value = dottedGet(context[source.from] || {}, source.path);
        break;
      default:
        throw new PredicateError(`unknown predicate source '${source.from}'`, { rule: 'source' });
    }
  }

  return isPresent(value) ? value : source.default;
}

function evaluateComparator(node, context) {
  const op = node.op;
  if (!OPERATORS.includes(op)) {
    throw new PredicateError(`unknown predicate operator '${op}'`, { rule: 'operator' });
  }

  const value = resolveSource(node.source, context);

  switch (op) {
    case 'exists':
      return isPresent(value);
    case 'not_exists':
      return !isPresent(value);
    case 'equals':
      return sameValue(value, node.operand);
    case 'not_equals':
      return !sameValue(value, node.operand);
    case 'one_of': {
      const candidates = Array.isArray(node.operands) ? node.operands
        : (Array.isArray(node.operand) ? node.operand : []);
      return candidates.some((candidate) => sameValue(value, candidate));
    }
    case 'range': {
      // operand { min?, max? } (inclusive), or operands [min, max].
      const bounds = Array.isArray(node.operands)
        ? { min: node.operands[0], max: node.operands[1] }
        : (node.operand || {});
      if (!isNumber(value)) return false;
      if (isNumber(bounds.min) && value < bounds.min) return false;
      if (isNumber(bounds.max) && value > bounds.max) return false;
      return true;
    }
    default:
      throw new PredicateError(`unhandled predicate operator '${op}'`, { rule: 'operator' });
  }
}

/**
 * Evaluate a `$defs/predicate` node. One level of allOf/anyOf composition,
 * exactly as the schema allows — no nesting beyond it, because the schema
 * does not permit it and a "convenience" recursion here would quietly widen
 * the grammar.
 *
 * @param {object} predicate the declared predicate (absent/undefined => true)
 * @param {object} context   resolved source values (see resolveSource)
 * @returns {boolean}
 */
export function evaluatePredicate(predicate, context = {}) {
  if (predicate === undefined || predicate === null) return true;
  if (typeof predicate !== 'object') {
    throw new PredicateError('predicate must be an object', { rule: 'shape' });
  }

  if (Array.isArray(predicate.allOf)) {
    return predicate.allOf.every((node) => evaluateComparator(node, context));
  }
  if (Array.isArray(predicate.anyOf)) {
    return predicate.anyOf.some((node) => evaluateComparator(node, context));
  }
  return evaluateComparator(predicate, context);
}

/** The closed operator set, exported so tests can assert nothing else exists. */
export const PREDICATE_OPERATORS = Object.freeze([...OPERATORS]);
