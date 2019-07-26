module.exports = {
  extends: "airbnb-base",
  env: {
    browser: true,
    node: true,
  },
  plugins: [
    "import",
    "html",
  ],
  globals: {
    "window": true,
    "document": true,
    "localStorage": true,
  },
  rules: {
    "arrow-body-style": ["off"],
    "camelcase": ["off"],
    "prefer-destructuring": ["off"],
    "max-len": ["error", 1000, 2, {
      ignoreUrls: true,
      ignoreComments: false,
      ignoreRegExpLiterals: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
    }],
    "comma-dangle": ["error", {
      arrays: "always-multiline",
      objects: "always-multiline",
      imports: "always-multiline",
      exports: "always-multiline",
      functions: "never",
    }],
    'no-param-reassign': ['error', {
      props: false,
    }],
    'no-mixed-operators': ["off"],
    'object-curly-newline': ['error', {
      ObjectExpression: { minProperties: 9, multiline: true, consistent: true },
      ObjectPattern: { minProperties: 9, multiline: true, consistent: true }
    }],
    "linebreak-style": 0
  },
};
