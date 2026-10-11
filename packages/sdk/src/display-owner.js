/** Compose host display admission with a consumer's local semantic lifetime. */
export default function createDisplayOwner(tommy, { current: localCurrent = () => true, onRetire } = {}) {
  let active = true;
  let ticket;
  try { ticket = tommy?.lifecycle?.captureDisplayEpisode?.(); } catch (_) { /* Missing admission fails closed. */ }
  const stop = () => {
    if (!active) return;
    active = false;
    try { ticket?.stop?.(); } catch (_) { /* A disposer cannot restore admission. */ }
    try { onRetire?.(); } catch (_) { /* Consumer cleanup is isolated. */ }
  };
  const current = () => {
    if (!active) return false;
    try {
      if (typeof ticket?.current === 'function' && typeof ticket?.stop === 'function'
        && ticket.current() === true && localCurrent() === true) return true;
    } catch (_) { /* A failed proof retires permanently. */ }
    stop();
    return false;
  };
  const assertCurrent = () => {
    if (!current()) throw Object.assign(new Error('The displayed view has retired'), { code: 'DATA_RETIRED', retryable: false });
  };
  return Object.freeze({ current, stop, assertCurrent });
}
