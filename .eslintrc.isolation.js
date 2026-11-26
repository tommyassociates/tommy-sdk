// Standalone MP-isolation lint (lint:isolation): the main config's airbnb extends are not installed here.
const iso = require('./eslint-mp-isolation.json');

// Strip _-prefixed annotation keys (_scope, _comment), which the ESLint schema rejects.
// production/ is a release-sync copy of development/src, so scanning it double-counts.
const overrides = iso.overrides.map((o) => ({
  ...Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_'))),
  files: o.files.filter((g) => !g.includes('/production/')),
}));

module.exports = {
  root: true,
  extends: ['plugin:vue/base'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    browser: true,
    es2022: true,
  },
  overrides,
};
