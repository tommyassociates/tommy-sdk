# Component (Vue/F7) panels — the addon-parity authoring path

`reference-mp` (Team Check-in) demonstrates the **plain-DOM** panel path
(`render(root, ctx)` into a closed shadow root) — the sandbox-isolated contract
for untrusted/third-party MPs.

First-party MPs may instead author panels as **Vue + Framework7 single-file
components** that share the host runtime — the same authoring experience as
legacy addons (spec `mp-vue-f7-component-runtime`). The canonical, buildable
template for that path lives at:

    sdk-private/mps/vue-panel-demo/

See its `README.md`. In short:

- `tommy.panels.register({ id, component })` — a `.vue` SFC instead of `render`.
  A panel provides **exactly one** of `component` / `render`.
- The SFC mounts in **light DOM** inside the host Framework7 app context, so
  `f7-*`, `$f7`, the theme and tommy-core inputs all resolve.
- Data still flows through the MP contract: the component gets `tommy` + `ctx`
  as props and uses `tommy.actions` / `tommy.data` / `tommy.host` — never
  `$api` / `$store` / the events bus.
- The MP build externalizes `vue` / `framework7-vue` to the host runtime bridge
  so there is one shared Vue instance (identity-verified in
  `app/tests/unit/mp-runtime-bridge.test.js`).
- The `component` path is **first-party only** until the M4 untrusted-review
  pipeline; untrusted MPs stay on this `render` + shadow-root path.

`reference-mp`'s own source stays import-free (its isolation detectors prove the
plain-DOM contract), so the Vue/F7 template is kept as a separate MP rather than
added here.
