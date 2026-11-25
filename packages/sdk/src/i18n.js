// Bound to the MP's own bundled locales, never the shared window.i18n.
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
