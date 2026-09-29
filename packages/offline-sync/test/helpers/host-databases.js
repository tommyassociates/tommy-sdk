import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteDatabase } from '../../src/host-store/index.js';

// IndexedDB key order: numbers < strings < arrays; arrays compare element-wise.
function compare(a, b) {
  const type = (value) => (Array.isArray(value) ? 3 : typeof value === 'string' ? 2 : 1);
  if (type(a) !== type(b)) return type(a) - type(b);
  if (Array.isArray(a)) {
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      const result = compare(a[index], b[index]);
      if (result) return result;
    }
    return a.length - b.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * The host-store transaction API with IndexedDB semantics (array keys, key
 * ranges bounded by `[...prefix, []]`, all-or-nothing transactions), for
 * exercising the port as the web adapter drives it.
 */
export function createMemoryIndexedDb() {
  let tables = { owners: new Map(), stores: new Map(), rows: new Map() };
  let tail = Promise.resolve();
  const encode = (key) => JSON.stringify(key);
  const sorted = (table) => [...tables[table].values()].sort((x, y) => compare(x.key, y.key));
  const inRange = (key, prefix, after) => {
    const lower = after === null ? prefix : [...prefix, after];
    const lowerOk = after === null ? compare(key, lower) >= 0 : compare(key, lower) > 0;
    return lowerOk && compare(key, [...prefix, []]) < 0;
  };
  const api = {
    get: async (table, key) => copy(tables[table].get(encode(key))),
    put: async (table, row) => { tables[table].set(encode(row.key), copy(row)); },
    delete: async (table, key) => { tables[table].delete(encode(key)); },
    byIndex: async (table, index, value, limit = 101) => sorted(table).filter((row) => row[index] === value).slice(0, limit).map(copy),
    async eachIndex(table, index, value, visit) {
      for (const row of sorted(table).filter((entry) => entry[index] === value)) await visit(copy(row));
    },
    scan: async (table, prefix, { after = null, limit = 101 } = {}) => sorted(table)
      .filter((row) => inRange(row.key, prefix, after)).slice(0, limit).map(copy),
    async deletePrefix(table, prefix) {
      sorted(table).filter((row) => inRange(row.key, prefix, null)).forEach((row) => tables[table].delete(encode(row.key)));
    },
  };
  return {
    kind: 'indexeddb',
    transaction(mode, work) {
      const result = tail.then(async () => {
        const saved = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, new Map(rows)]));
        try { return await work(api); } catch (error) { tables = saved; throw error; }
      });
      tail = result.catch(() => {});
      return result;
    },
    async close() {},
  };
}

/** The host-store SQLite engine on node:sqlite (WAL needs a file), as the desktop and native adapters drive it. */
export function createNodeSqliteDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'host-store-'));
  const connection = new DatabaseSync(join(directory, 'store.sqlite'));
  let closed = false;
  const database = createSqliteDatabase({ driver: {
    async run(sql, args) { return connection.prepare(sql).run(...args); },
    async query(sql, args) { return connection.prepare(sql).all(...args); },
    async close() { if (!closed) { closed = true; connection.close(); rmSync(directory, { recursive: true, force: true }); } },
  } });
  return Object.assign(database, { kind: 'sqlite' });
}

export const DATABASES = [['indexeddb', createMemoryIndexedDb], ['sqlite', createNodeSqliteDatabase]];

export function identity({ viewerId = '7', accountType = 'User', accountId = '7', mpId = 'platform-data', tenantId = 'user-7', origin = 'https://api.example.test' } = {}) {
  return { version: 2, authorityOrigin: origin, viewerId, accountType, accountId, tenantId, mpId, subjectKey: null };
}

/** A fake BroadcastChannel bus: every channel on the bus sees the others' posts. */
export function createChannelBus() {
  const members = new Set();
  return class FakeBroadcastChannel {
    constructor() { members.add(this); this.onmessage = null; }
    postMessage(data) {
      const payload = JSON.parse(JSON.stringify(data));
      members.forEach((member) => { if (member !== this) queueMicrotask(() => member.onmessage?.({ data: payload })); });
    }
    close() { members.delete(this); }
  };
}
