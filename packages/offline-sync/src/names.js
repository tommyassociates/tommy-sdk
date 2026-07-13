/**
 * names.js — the ONLY resolver of per-(tenant, MP) store names
 * (offline-sync.md §1, §8.8 requirement 3).
 *
 * `tommy-mp:{tenantId}:{mpId}` — the tenantId segment is ALWAYS derived from
 * the active capability token, never caller-supplied: without it two teams
 * with the same MP collide on one store (the D-multi-team regression). No
 * caller may construct `tommy-mp:` names directly — a blocking static check
 * (sdk `check:store-name-literals`) rejects literal construction outside
 * this module.
 */

export function databaseName(issuedToken, mpId) {
  const tenantId = issuedToken && issuedToken.tenantId;
  if (!tenantId) throw new Error('databaseName: tenantId must come from the capability token');
  if (!mpId) throw new Error('databaseName: mpId required');
  if (issuedToken.mpId && issuedToken.mpId !== mpId) {
    throw new Error(`databaseName: token is bound to mp '${issuedToken.mpId}', not '${mpId}'`);
  }
  return ['tommy-mp', tenantId, mpId].join(':');
}

/** The broker's own store — action-run records + trigger queue; not MP-reachable. */
export const BROKER_DATABASE = ['tommy', 'broker'].join('-');
