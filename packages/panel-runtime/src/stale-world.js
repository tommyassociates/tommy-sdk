/**
 * stale-world.js — the refusals an MP world is given once its account is not
 * the one displayed.
 *
 * Every account switch produces them for the panels of the account being left
 * that are still on screen: the store commits the new account before the
 * loader pauses the old world, and in between the old world's reads and its
 * time display refuse. The refusal is the answer, not a fault, so neither a
 * panel tile (panel-tile.js) nor the host's unhandled-rejection handler
 * (app/src/services/expected-outcomes.js, which re-exports this) treats it as
 * one.
 *
 * - `ACCOUNT_NOT_DISPLAYED`: a host call (app mp-loader/host-services.js
 *   `shownOnly`).
 * - `TIMEZONE_CONTEXT_STALE`: the world's time display (core
 *   src/utils/time-display.js).
 * - `staleWorld: true`: a refusal whose code is shared with genuine failures
 *   but that the host raised only because the world's account is not the
 *   one displayed — the directory capability's "belongs to another account"
 *   `PermissionDenied` (host-services.js `otherAccount`). The marker, not the
 *   code, classifies it, so a genuine `PermissionDenied` is never taken as
 *   stale.
 *
 * This is the ONE list: the sdk cannot import the app, so the app imports it.
 */
export const STALE_WORLD_CODES = Object.freeze(['ACCOUNT_NOT_DISPLAYED', 'TIMEZONE_CONTEXT_STALE']);

/** Mark a host refusal as stale-world (returns the same error). */
export function markStaleWorld(error) {
  if (error && typeof error === 'object') error.staleWorld = true;
  return error;
}

/** Whether `reason` (an error or rejection reason) is a stale-world refusal. */
export function isStaleWorldRefusal(reason) {
  if (!reason || typeof reason !== 'object') return false;
  return STALE_WORLD_CODES.includes(reason.code) || reason.staleWorld === true;
}
