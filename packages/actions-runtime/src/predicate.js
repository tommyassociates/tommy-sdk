// The one evaluator for the schema's closed comparator set; a second would drift.

// Thrown when a predicate cannot be evaluated by this binary.
export class PredicateError extends Error {
  constructor(message, { rule } = {}) {
    super(message);
    this.name = 'PredicateError';
    this.code = 'PredicateError';
    this.rule = rule || null;
  }
}

// Operators land here, in the other evaluator and in the schema in one release.
const OPERATORS = ['exists', 'not_exists', 'equals', 'not_equals', 'one_of', 'range', 'includes_any'];

function dottedGet(obj, path) {
  if (!path) return obj;
  return String(path).split('.').reduce((acc, part) => (acc === null || acc === undefined ? undefined : acc[part]), obj);
}

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

export function resolveSource(source, context = {}) {
  if (!source || typeof source !== 'object') {
    throw new PredicateError('predicate source must be an object', { rule: 'source' });
  }
  if (source.transform) {
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
    case 'includes_any': {
      // Missing operands is false, never an error or a coerced single value.
      const candidates = Array.isArray(node.operands) ? node.operands
        : (Array.isArray(node.operand) ? node.operand : []);
      if (!Array.isArray(value)) return false;
      return value.some((element) => candidates.some((candidate) => sameValue(element, candidate)));
    }
    case 'range': {
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

// One level of allOf/anyOf only, exactly as the schema allows.
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

export const PREDICATE_OPERATORS = Object.freeze([...OPERATORS]);
