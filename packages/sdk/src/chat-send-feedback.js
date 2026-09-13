export const CHAT_SEND_NOTICE_MS = 30_000;

/** Local presentation deadlines only. Receipt recovery belongs to the host. */
export function createChatSendFeedback({ read, onChange, now = () => Date.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay), clearTimer = (timer) => clearTimeout(timer) }) {
  let timer = null;
  let disposed = false;
  function refresh() {
    if (disposed) return;
    if (timer !== null) clearTimer(timer);
    timer = null;
    const time = now();
    const delayed = new Set();
    let next = Infinity;
    for (const { key, startedAt, pending } of read()) {
      if (!pending || !Number.isFinite(startedAt)) continue;
      const remaining = startedAt + CHAT_SEND_NOTICE_MS - time;
      if (remaining <= 0) delayed.add(key);
      else next = Math.min(next, remaining);
    }
    onChange(delayed);
    if (next !== Infinity) timer = setTimer(refresh, next);
  }
  return Object.freeze({ refresh, dispose() {
    disposed = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
  } });
}
