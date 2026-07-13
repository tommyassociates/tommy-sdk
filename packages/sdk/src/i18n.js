/**
 * i18n.js — t() bound to the MP's OWN bundled locales, never the shared
 * window.i18n (audit 1.2 — no ambient globals). `{{var}}` interpolation only.
 */
export function createT({ locales = {}, locale = 'en' } = {}) {
  const table = locales[locale] || locales[String(locale).split('-')[0]] || {};
  return function t(key, fallback, vars) {
    let text = table[key] !== undefined ? table[key] : fallback;
    if (vars && typeof text === 'string') {
      text = text.replace(/\{\{(\w+)\}\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
    }
    return text;
  };
}
