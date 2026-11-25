// Refusals a world gets once its account is no longer displayed (every switch, for panels still on screen).
export const STALE_WORLD_CODES = Object.freeze(['ACCOUNT_NOT_DISPLAYED', 'TIMEZONE_CONTEXT_STALE']);

export function markStaleWorld(error) {
  if (error && typeof error === 'object') error.staleWorld = true;
  return error;
}

export function isStaleWorldRefusal(reason) {
  if (!reason || typeof reason !== 'object') return false;
  return STALE_WORLD_CODES.includes(reason.code) || reason.staleWorld === true;
}
