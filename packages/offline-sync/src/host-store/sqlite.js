import { storageError } from './protocol.js';

const TABLES = new Set(['owners', 'stores', 'rows']);
const fields = ['owner', 'namespace', 'generation', 'kind'];
const encoded = (key) => JSON.stringify(key);
const ordering = (value) => Array.from({ length: String(value).length }, (_, index) => String(value).charCodeAt(index).toString(16).padStart(4, '0')).join('');
const tableName = (table) => { if (!TABLES.has(table)) throw storageError('unserializable'); return table; };
const decoded = (rows) => rows.map((row) => JSON.parse(row.payload));
function prefixWhere(prefix) {
  if (!Array.isArray(prefix) || prefix.length > fields.length) throw storageError('unserializable');
  return prefix.map((_, index) => `${fields[index]} = ?`).join(' AND ') || '1 = 1';
}
// Tables whose rows an exclusive database answers from memory once read.
const HELD_TABLES = new Set(['owners', 'stores']);
/**
 * Fixed SQL only. Driver owns its native connection; no SQL reaches the MP API.
 *
 * `exclusive`: this page is the database's only user (a phone's WebView, where
 * every statement is a native bridge call). Its transactions already run one
 * after another here, so a read needs no BEGIN and COMMIT of its own; and the
 * owner and store rows, which change only through this driver, are answered
 * from memory once read. A read was six bridge calls, four of them these.
 */
export function createSqliteDatabase({ driver, exclusive = false }) {
  let tail = Promise.resolve();
  let initialized;
  // Owner and store rows as last read or committed here, by table and key:
  // their JSON, or null for a row known absent (exclusive only).
  const held = new Map([...HELD_TABLES].map((table) => [table, new Map()]));
  const forgetHeld = () => held.forEach((rows) => rows.clear());
  // A failed open is not remembered: the next transaction opens again.
  async function initialize() {
    if (!initialized) {
      const opening = setUp();
      initialized = opening;
      opening.catch(() => { if (initialized === opening) initialized = undefined; });
    }
    return initialized;
  }
  function setUp() {
    return (async () => {
      await driver.open?.();
      // A native connection kept across a WebView reload can still hold the
      // reloaded page's open transaction; the pragmas below are refused inside
      // one ("Safety level may not be changed inside a transaction"). That
      // page is gone, so its work is rolled back. With none open this errors.
      await driver.run('ROLLBACK', []).catch(() => {});
      const mode = await driver.query('PRAGMA journal_mode = WAL', []);
      if (String(mode[0]?.journal_mode).toLowerCase() !== 'wal') throw storageError('unavailable');
      await driver.run('PRAGMA synchronous = FULL', []);
      const sync = await driver.query('PRAGMA synchronous', []);
      if (Number(sync[0]?.synchronous) !== 2) throw storageError('unavailable');
      const version = await driver.query('PRAGMA user_version', []);
      if (![0, 1].includes(Number(version[0]?.user_version))) throw storageError('unavailable');
      await driver.run('BEGIN IMMEDIATE', []);
      try {
        for (const table of TABLES) {
          await driver.run(`CREATE TABLE IF NOT EXISTS ${table} (key TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, namespace TEXT, generation INTEGER, kind TEXT, row_order TEXT NOT NULL, principal TEXT, policy TEXT, payload TEXT NOT NULL)`, []);
        }
        await driver.run('CREATE INDEX IF NOT EXISTS host_owners_principal ON owners(principal)', []);
        await driver.run('CREATE INDEX IF NOT EXISTS host_stores_policy ON stores(policy)', []);
        await driver.run('CREATE INDEX IF NOT EXISTS host_rows_prefix ON rows(owner, namespace, generation, kind, row_order)', []);
        await driver.run('CREATE INDEX IF NOT EXISTS host_stores_owner ON stores(owner, row_order)', []);
        await driver.run('PRAGMA user_version = 1', []);
        await driver.run('COMMIT', []);
      } catch (error) { await driver.run('ROLLBACK', []).catch(() => {}); throw error; }
    })();
  }
  return {
    transaction(mode, work) {
      const result = tail.then(async () => {
        await initialize();
        const bare = exclusive && mode !== 'readwrite';
        if (!bare) await driver.run(mode === 'readwrite' ? 'BEGIN IMMEDIATE' : 'BEGIN', []);
        // Held rows this transaction wrote: read from the database until it
        // commits, then held as committed.
        const written = new Map();
        let clearedHeld = false;
        const heldRows = (table) => (exclusive && HELD_TABLES.has(table) ? held.get(table) : null);
        const wrote = (table, key, json) => {
          if (!heldRows(table)) return;
          if (!written.has(table)) written.set(table, new Map());
          written.get(table).set(encoded(key), json);
        };
        const tx = {
          async get(table, key) {
            const rows = heldRows(table);
            const id = encoded(key);
            const own = written.get(table)?.has(id) || clearedHeld;
            if (rows && !own && rows.has(id)) {
              const json = rows.get(id);
              return json === null ? undefined : JSON.parse(json);
            }
            const found = await driver.query(`SELECT payload FROM ${tableName(table)} WHERE key = ?`, [id]);
            if (rows && !own) rows.set(id, found.length ? found[0].payload : null);
            return decoded(found)[0];
          },
          // One query per 100 keys, not one per key: on Capacitor every query is a
          // native bridge round trip (~15 ms), and a keyed read of 250 rows was
          // ~500 of them — 1.5 s per full-store read on an Android phone.
          // Results follow `keys` order; a missing key is `undefined`.
          async getMany(table, keys) {
            const found = new Map();
            for (let start = 0; start < keys.length; start += 100) {
              const chunk = keys.slice(start, start + 100).map(encoded);
              const rows = await driver.query(`SELECT key, payload FROM ${tableName(table)} WHERE key IN (${chunk.map(() => '?').join(', ')})`, chunk);
              for (const row of rows) found.set(row.key, JSON.parse(row.payload));
            }
            return keys.map((key) => found.get(encoded(key)));
          },
          async put(table, row) {
            const parts = Array.isArray(row.key) ? row.key : [row.key];
            const json = JSON.stringify(row);
            await driver.run(`INSERT INTO ${tableName(table)} (key, owner, namespace, generation, kind, row_order, principal, policy, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET owner=excluded.owner, namespace=excluded.namespace, generation=excluded.generation, kind=excluded.kind, row_order=excluded.row_order, principal=excluded.principal, policy=excluded.policy, payload=excluded.payload`, [encoded(row.key), parts[0], parts[1] ?? null, parts[2] ?? null, parts[3] ?? null, ordering(parts.at(-1)), row.principal ?? null, row.policy ?? null, json]);
            wrote(table, row.key, json);
          },
          async delete(table, key) {
            await driver.run(`DELETE FROM ${tableName(table)} WHERE key = ?`, [encoded(key)]);
            wrote(table, key, null);
          },
          async byIndex(table, index, value, limit = 101) {
            if (!['principal', 'policy'].includes(index) || !Number.isInteger(limit) || limit < 1 || limit > 1001) throw storageError('unserializable');
            return decoded(await driver.query(`SELECT payload FROM ${tableName(table)} WHERE ${index} = ? ORDER BY key LIMIT ?`, [value, limit]));
          },
          async eachIndex(table, index, value, visit) {
            if (!['principal', 'policy'].includes(index)) throw storageError('unserializable');
            let after = '';
            for (;;) {
              const rows = await driver.query(`SELECT key, payload FROM ${tableName(table)} WHERE ${index} = ? AND key > ? ORDER BY key LIMIT 100`, [value, after]);
              if (!rows.length) return;
              for (const row of rows) await visit(JSON.parse(row.payload));
              after = rows.at(-1).key;
            }
          },
          async scan(table, prefix, { after = null, limit = 101 } = {}) {
            if (!Number.isInteger(limit) || limit < 1 || limit > 1001) throw storageError('unserializable');
            const where = prefixWhere(prefix);
            return decoded(await driver.query(`SELECT payload FROM ${tableName(table)} WHERE ${where}${after === null ? '' : ' AND row_order > ?'} ORDER BY row_order LIMIT ?`, [...prefix, ...(after === null ? [] : [ordering(after)]), limit]));
          },
          async deletePrefix(table, prefix) {
            await driver.run(`DELETE FROM ${tableName(table)} WHERE ${prefixWhere(prefix)}`, prefix);
            if (heldRows(table)) clearedHeld = true;
          },
        };
        try {
          const value = await work(tx);
          if (!bare) await driver.run('COMMIT', []);
          if (clearedHeld) forgetHeld();
          else written.forEach((rows, table) => rows.forEach((json, id) => held.get(table).set(id, json)));
          return value;
        } catch (error) {
          // What it wrote is undone; what is held may have been read inside it.
          if (written.size || clearedHeld) forgetHeld();
          if (!bare) await driver.run('ROLLBACK', []).catch(() => {});
          throw error;
        }
      });
      tail = result.catch(() => {});
      return result;
    },
    close() {
      const closing = tail.then(async () => { initialized = undefined; forgetHeld(); await driver.close?.(); });
      tail = closing.catch(() => {});
      return closing;
    },
  };
}
