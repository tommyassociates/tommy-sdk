// A refusal's own server code, never a runtime one.
const SERVER_CODE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export function holdSubject(hold, args) {
  const values = hold.key.map((field) => args?.[field]);
  if (values.some((value) => !(typeof value === 'string' && value) && !Number.isFinite(value))) return null;
  return JSON.stringify(values.map(String));
}

export function unsettledReason(error, hold) {
  let cause = error;
  for (let depth = 0; cause && depth < 8; depth += 1) {
    const status = Number(cause.status ?? cause.response?.status);
    if (Number.isInteger(status) && status > 0) {
      const code = [cause.code, cause.data?.code].find((one) => typeof one === 'string' && SERVER_CODE.test(one)) || null;
      if (code && ((hold.holdCodes || []).includes(code) || (hold.keepCodes || []).includes(code))) return code;
      if (status === 408 || status >= 500) return code && (hold.settleCodes || []).includes(code) ? null : 'unconfirmed';
      return code ? null : 'unconfirmed';
    }
    cause = cause.cause;
  }
  return 'unconfirmed';
}
