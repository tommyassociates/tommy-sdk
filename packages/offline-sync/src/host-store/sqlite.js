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
/** Fixed SQL only. Driver owns its native connection; no SQL reaches the MP API. */
export function createSqliteDatabase({ driver }) {
  let tail = Promise.resolve();
  let initialized;
  async function initialize() {
    if (!initialized) initialized = (async () => {
      await driver.open?.();
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
    return initialized;
  }
  return {
    transaction(mode, work) {
      const result = tail.then(async () => {
        await initialize();
        await driver.run(mode === 'readwrite' ? 'BEGIN IMMEDIATE' : 'BEGIN', []);
        const tx = {
          async get(table, key) { return decoded(await driver.query(`SELECT payload FROM ${tableName(table)} WHERE key = ?`, [encoded(key)]))[0]; },
          async put(table, row) {
            const parts = Array.isArray(row.key) ? row.key : [row.key];
            await driver.run(`INSERT INTO ${tableName(table)} (key, owner, namespace, generation, kind, row_order, principal, policy, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET owner=excluded.owner, namespace=excluded.namespace, generation=excluded.generation, kind=excluded.kind, row_order=excluded.row_order, principal=excluded.principal, policy=excluded.policy, payload=excluded.payload`, [encoded(row.key), parts[0], parts[1] ?? null, parts[2] ?? null, parts[3] ?? null, ordering(parts.at(-1)), row.principal ?? null, row.policy ?? null, JSON.stringify(row)]);
          },
          delete: (table, key) => driver.run(`DELETE FROM ${tableName(table)} WHERE key = ?`, [encoded(key)]),
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
          deletePrefix: (table, prefix) => driver.run(`DELETE FROM ${tableName(table)} WHERE ${prefixWhere(prefix)}`, prefix),
        };
        try { const value = await work(tx); await driver.run('COMMIT', []); return value; } catch (error) { await driver.run('ROLLBACK', []).catch(() => {}); throw error; }
      });
      tail = result.catch(() => {});
      return result;
    },
    async close() { await tail; await driver.close?.(); },
  };
}
