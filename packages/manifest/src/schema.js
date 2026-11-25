import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import embeddedSchema from './schema/manifest-schema.embedded.js';

export function loadSchema() {
  return embeddedSchema;
}

export function compileValidator(schema = loadSchema()) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    verbose: true,
  });
  addFormats.default(ajv);
  return ajv.compile(schema);
}
