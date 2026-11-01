/** Internal committed-row invalidations; public subscribers receive no row data. */
export function createQueueChanges() {
  const listeners = new Set();
  const pending = new Set();
  let scheduled = false;
  return {
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    committed(rows) {
      if (!rows.length) return;
      rows.forEach((row) => pending.add(row));
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const changed = [...pending];
        pending.clear();
        for (const callback of [...listeners]) {
          try { callback(changed); } catch (_) { /* observers cannot interrupt queue writes */ }
        }
      });
    },
    clear() { listeners.clear(); pending.clear(); },
  };
}
