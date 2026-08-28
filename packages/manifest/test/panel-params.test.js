// 01c FR-11 — `panels[].params`: the panel's DECLARED parameter vocabulary.
//
// Before this field the vocabulary lived nowhere: PanelInstance.params (the
// `dashboards` team Setting) could bind any name to any source and the host's
// per-panel settings UI had nothing to render from — it would have had to
// execute MP code to learn what a panel needs, which the review pipeline
// forbids. The declaration closes that: name + type + source is enough for
// the UI to draw the right input (picker for 'id', toggle for 'boolean') and
// for the FR-12 resolver to know the legal order — surface context, then the
// admin's static value, then the declaration default, else needs-configuration.
//
// The field is OPTIONAL and purely additive: every manifest that validated
// before this schema minor still validates (the last case pins that), so no
// re-vendor of published MPs is forced. `source` constrains provenance, not
// presence — 'context' params never show as editable in settings, which is
// why the enum lives here and not in the host.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateManifest, parseManifest } from '../src/index.js';
import { loadSchema } from '../src/schema.js';

const BASE = readFileSync(fileURLToPath(new URL('./fixtures/valid-minimal.yml', import.meta.url)), 'utf8');
const ANCHOR = '    size: { defaultW: 4, defaultH: 3 }\n';

/** valid-minimal with a params block appended to its one panel. */
function withParams(block) {
  expect(BASE).toContain(ANCHOR); // the anchor must still exist in the fixture
  return BASE.replace(ANCHOR, ANCHOR + block);
}

const errorsOf = (yaml) => {
  const r = validateManifest(yaml);
  return r.ok ? [] : r.errors.map((e) => `${e.rule || ''} ${e.message || ''}`);
};

const paramsOf = (yaml) => parseManifest(yaml).data.panels[0].params;

describe('FR-11 — panels[].params declared vocabulary', () => {
  it('the param object DECLARES exactly the six keys, closed, with the exact enums', () => {
    const spec = loadSchema().properties.panels.items.properties.params.items;
    expect(spec.additionalProperties).toBe(false);
    expect(spec.required).toEqual(['name', 'type']);
    expect(Object.keys(spec.properties).sort())
      .toEqual(['description', 'label', 'name', 'required', 'source', 'type']);
    expect(spec.properties.type.enum).toEqual(['string', 'integer', 'boolean', 'id']);
    expect(spec.properties.source.enum).toEqual(['context', 'static', 'any']);
    expect(spec.properties.name.pattern).toBe('^[a-z][a-z0-9_]*$');
  });

  it('accepts a fully-specified param and round-trips it through parse', () => {
    const yaml = withParams(
      '    params:\n'
      + '      - name: client_id\n'
      + '        type: id\n'
      + '        required: true\n'
      + '        source: context\n'
      + '        label: Client\n'
      + '        description: Which client this panel is about.\n',
    );
    expect(errorsOf(yaml)).toEqual([]);
    expect(paramsOf(yaml)).toEqual([{
      name: 'client_id',
      type: 'id',
      required: true,
      source: 'context',
      label: 'Client',
      description: 'Which client this panel is about.',
    }]);
  });

  it('accepts every type and every source the enums declare', () => {
    for (const type of ['string', 'integer', 'boolean', 'id']) {
      for (const source of ['context', 'static', 'any']) {
        const yaml = withParams(`    params:\n      - name: p_one\n        type: ${type}\n        source: ${source}\n`);
        expect(errorsOf(yaml), `${type}/${source}`).toEqual([]);
      }
    }
  });

  it('accepts the minimal spec — name + type; required/source defaults are informational (host-applied), never injected', () => {
    const yaml = withParams('    params:\n      - name: actor_id\n        type: id\n');
    expect(errorsOf(yaml)).toEqual([]);
    // The validator must not mutate the document: absent stays absent, the
    // host reads the schema defaults (required:false, source:'any') itself.
    expect(paramsOf(yaml)).toEqual([{ name: 'actor_id', type: 'id' }]);
  });

  it('REJECTS names outside ^[a-z][a-z0-9_]*$ — the binding key is the wire key, not display text', () => {
    for (const bad of ['Client_id', '9lives', 'has-dash', '_leading', '']) {
      const yaml = withParams(`    params:\n      - name: ${JSON.stringify(bad)}\n        type: string\n`);
      expect(errorsOf(yaml).length, JSON.stringify(bad)).toBeGreaterThanOrEqual(1);
    }
  });

  it('REJECTS an unknown key on the param object — the vocabulary is closed like the rest of the panel block', () => {
    const yaml = withParams('    params:\n      - name: client_id\n        type: id\n        placeholder: nope\n');
    expect(errorsOf(yaml).length).toBeGreaterThanOrEqual(1);
  });

  it('REJECTS a param missing name or type, and values outside the enums', () => {
    const bad = [
      '    params:\n      - type: string\n',                       // no name
      '    params:\n      - name: client_id\n',                    // no type
      '    params:\n      - name: client_id\n        type: uuid\n', // not a declared type
      '    params:\n      - name: client_id\n        type: id\n        source: server\n', // not a declared source
    ];
    for (const block of bad) {
      expect(errorsOf(withParams(block)).length, JSON.stringify(block)).toBeGreaterThanOrEqual(1);
    }
  });

  it('REJECTS description over 200 chars — settings-UI help text, not documentation', () => {
    const yaml = withParams(`    params:\n      - name: client_id\n        type: id\n        description: ${'x'.repeat(201)}\n`);
    expect(errorsOf(yaml).length).toBeGreaterThanOrEqual(1);
  });

  it('a panel with NO params still validates — the field is additive', () => {
    expect(errorsOf(BASE)).toEqual([]);
  });
});
