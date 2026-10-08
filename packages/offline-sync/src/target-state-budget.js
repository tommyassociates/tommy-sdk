import { utf8Bytes } from './bytes.js'; // eslint-disable-line import/extensions

const unknown = () => ({ state: 'stale', syncedAt: null, error: null, flight: null });
function boundedText(value, maxBytes) {
  if (typeof value !== 'string') return null;
  let text = '';
  let bytes = 0;
  let offset = 0;
  while (offset < value.length) {
    const character = String.fromCodePoint(value.codePointAt(offset));
    const size = utf8Bytes(character);
    if (bytes + size > maxBytes) break;
    text += character;
    bytes += size;
    offset += character.length;
  }
  return text;
}
function boundedState() {
  const state = unknown();
  let error = null;
  Object.defineProperty(state, 'error', {
    enumerable: true,
    get: () => error,
    set(value) {
      if (!value) { error = null; return; }
      error = {
        code: boundedText(value.code, 256),
        status: typeof value.status === 'number' && Number.isFinite(value.status)
          ? value.status : boundedText(value.status, 64),
        message: boundedText(value.message, 2048),
      };
    },
  });
  return state;
}
const refuse = (message, code) => Object.assign(new Error(message), {
  name: 'DataServiceError', code, retryable: code === 'DATA_TARGET_LIMIT',
});

/** Bounded freshness bookkeeping; rows and read barriers stay with the service. */
export default function createTargetStateBudget({ states, budgetOf }) {
  const groups = new Map();
  let retired = false;
  function policy(collection) {
    const budget = budgetOf(collection);
    if (budget === undefined || budget === null) return null;
    if (!Number.isSafeInteger(budget.maxEntries) || budget.maxEntries < 1
      || !Number.isSafeInteger(budget.maxBytes) || budget.maxBytes < 1) {
      throw refuse(`'${collection}' has an invalid target state budget`, 'DATA_INVALID');
    }
    return budget;
  }
  function groupOf(collection) {
    if (!groups.has(collection)) groups.set(collection, { entries: new Map(), bytes: 0 });
    return groups.get(collection);
  }
  const touch = (group, key, entry) => {
    if (entry.whole || group.entries.get(key) !== entry) return;
    group.entries.delete(key);
    group.entries.set(key, entry);
  };
  function allocate(group, key, whole, budget) {
    const bytes = utf8Bytes(key);
    let count = group.entries.size + 1;
    let size = group.bytes + bytes;
    const victims = [];
    const entries = group.entries.entries();
    let candidate = entries.next();
    while (!candidate.done && (count > budget.maxEntries || size > budget.maxBytes)) {
      const [candidateKey, entry] = candidate.value;
      if (!entry.whole && !entry.pins && !entry.state.flight) {
        victims.push([candidateKey, entry]);
        count -= 1;
        size -= entry.bytes;
      }
      candidate = entries.next();
    }
    if (count > budget.maxEntries || size > budget.maxBytes) {
      throw refuse('Target status capacity is occupied or its key is too large', 'DATA_TARGET_LIMIT');
    }
    victims.forEach(([victim, entry]) => {
      group.entries.delete(victim);
      group.bytes -= entry.bytes;
      states.delete(victim);
    });
    const state = boundedState();
    const entry = { state, bytes, whole, pins: 0 };
    group.entries.set(key, entry);
    group.bytes += bytes;
    states.set(key, state);
    return entry;
  }
  function entryFor(key, { allocate: requested = true } = {}) {
    const [collection, rowKey, window, query] = JSON.parse(key);
    const budget = policy(collection);
    if (!budget) {
      if (!states.has(key)) states.set(key, unknown());
      return { state: states.get(key) };
    }
    if (retired) return { state: unknown() };
    const whole = rowKey === null && window === null && query === null;
    const existing = groups.get(collection)?.entries.get(key);
    if (existing) {
      touch(groups.get(collection), key, existing);
      return { entry: existing, group: groups.get(collection), state: existing.state };
    }
    if (!requested && !whole) return { state: unknown() };
    const group = groupOf(collection);
    const wholeKey = JSON.stringify([collection, null, null, null]);
    // Collection access/failure status always survives exact-target turnover.
    if (!group.entries.has(wholeKey)) allocate(group, wholeKey, true, budget);
    const entry = whole ? group.entries.get(wholeKey) : allocate(group, key, false, budget);
    return { entry, group, state: entry.state };
  }
  return {
    get: (key, options) => entryFor(key, options).state,
    acquire(key) {
      const { state, entry, group } = entryFor(key);
      if (!entry) return { state };
      entry.pins += 1;
      let released = false;
      return {
        state,
        release() {
          if (released) return;
          released = true;
          entry.pins -= 1;
          touch(group, key, entry);
        },
      };
    },
    clear() {
      retired = true;
      groups.forEach((group) => { group.entries.clear(); group.bytes = 0; });
      groups.clear();
    },
  };
}
