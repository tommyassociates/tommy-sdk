import { storageError, bytes } from './protocol.js';

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
const HELD_TABLES = new Set(['owners', 'stores']);
export function createSqliteDatabase({ driver, exclusive = false }) {
  let tail = Promise.resolve();
  let initialized;
  const held = new Map([...HELD_TABLES].map((table) => [table, new Map()]));
  const scans = new Map();
  let heldBytes = 0;
  let heldCount = 0;
  const forgetHeld = () => { held.forEach((rows) => rows.clear()); scans.clear(); heldBytes = 0; heldCount = 0; };
  const remember = (rows, id, json) => {
    const cost = bytes(id) + bytes(json);
    if (cost > 4 * 1024 * 1024) return;
    const previous = rows.get(id);
    if (rows.has(id)) heldBytes -= bytes(id) + bytes(previous);
    else heldCount += 1;
    if (heldBytes + cost > 4 * 1024 * 1024 || heldCount > 4096) { forgetHeld(); heldCount = 1; }
    rows.set(id, json);
    heldBytes += cost;
  };
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
            if (rows && !own) remember(rows, id, found.length ? found[0].payload : null);
            return decoded(found)[0];
          },
          // One query per 100 keys: each Capacitor query is a ~15 ms bridge round trip.
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
            const id = encoded([tableName(table), prefix, after, limit]);
            const reusable = heldRows(table) && !written.has(table) && !clearedHeld;
            if (reusable && scans.has(id)) return JSON.parse(scans.get(id));
            const result = decoded(await driver.query(`SELECT payload FROM ${table} WHERE ${where}${after === null ? '' : ' AND row_order > ?'} ORDER BY row_order LIMIT ?`, [...prefix, ...(after === null ? [] : [ordering(after)]), limit]));
            if (reusable) remember(scans, id, JSON.stringify(result));
            return result;
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
          else {
            if (written.size) {
              for (const [id, json] of scans) {
                if (!written.has(JSON.parse(id)[0])) continue;
                scans.delete(id); heldBytes -= bytes(id) + bytes(json); heldCount -= 1;
              }
            }
            written.forEach((rows, table) => rows.forEach((json, id) => remember(held.get(table), id, json)));
          }
          return value;
        } catch (error) {
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
