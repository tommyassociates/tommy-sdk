// The only resolver of store names; tenantId always comes from the capability token, never a caller.

export function databaseName(issuedToken, mpId) {
  const tenantId = issuedToken && issuedToken.tenantId;
  if (!tenantId) throw new Error('databaseName: tenantId must come from the capability token');
  if (!mpId) throw new Error('databaseName: mpId required');
  if (issuedToken.mpId && issuedToken.mpId !== mpId) {
    throw new Error(`databaseName: token is bound to mp '${issuedToken.mpId}', not '${mpId}'`);
  }
  return ['tommy-mp', tenantId, mpId].join(':');
}

// The viewer is encoded, so it cannot reach another name.
export function viewerDatabaseName(issuedToken, mpId, viewer) {
  if (typeof viewer !== 'string' || !viewer) throw new Error('viewerDatabaseName: viewer required');
  return [databaseName(issuedToken, mpId), `viewer=${encodeURIComponent(viewer)}`].join(':');
}

export const BROKER_DATABASE = ['tommy', 'broker'].join('-');
