/**
 * index.js — builds + freezes the `tommy` object; installs the unknown-method
 * guard on every namespace (03-sdk-runtime/README module map).
 *
 * M1 namespace split (sdk-broker harden round-1): IMPLEMENTED here — `init`,
 * `actions`, `data` (via @tommy/offline-sync, injected), `log`, `t`, errors +
 * the guard. STUBBED as guard-throwing placeholders — `panels` (owned by
 * @tommy/panel-runtime + the loader, injected when present), `ui`, `directory`,
 * `device`, `host`, `navigation`, `theme`, `messaging`, `clock`, `lifecycle`,
 * `notifications`, `session`, `user`, `billing` (host-services work, later
 * milestones). ALL types ported verbatim (src/types.ts).
 *
 * Mode opacity: the returned object exposes nothing adapter-identifying.
 */
import { guard, TommyError, TommySDKError, isTommyError } from './errors.js';
import { createActionsApi } from './actions.js';
import { createT } from './i18n.js';

export { TommyError, TommySDKError, isTommyError } from './errors.js';
export { createDirectAdapter } from './adapter-direct.js';
export { DEFAULT_RPC_TIMEOUT_MS } from './adapter.js';

const STUB_NAMESPACES = [
  'ui', 'directory', 'device', 'host', 'navigation', 'theme', 'messaging',
  'clock', 'lifecycle', 'notifications', 'session', 'user', 'billing',
  // Manifest-driven settings runtime delivery: `tommy.settings.get()` reads
  // THIS MP's own declared settings document. There is no cross-MP read on
  // this namespace — an MP reads another's setting only through a declared
  // `{ from: setting, mp }` source, so the dependency is in the manifest.
  'settings',
  // PARKED A.1 — `tommy.tours.start(id)` / `.available()`, a handle on the HOST's
  // existing tour runtime (tommy-core/src/tour). REGISTRATION IS NOT HERE, on
  // purpose: the host registers an MP's DECLARED tours at load, because the
  // manifest is what the publish-time checker vets (M19-M22) and a tour
  // registered imperatively at runtime would route around all four gates.
  'tours',
];

function stubNamespace(name) {
  // An EMPTY guarded object: every access throws UnknownMethod with the
  // namespace named — a placeholder, not a silent undefined.
  return guard({}, name);
}

/**
 * @param {object} opts
 * @param {object} opts.adapter transport adapter (createDirectAdapter at M1)
 * @param {object} opts.init the MpInit payload (loader-supplied)
 * @param {object} [opts.data] DataApi from @tommy/offline-sync (loader-injected)
 * @param {object} [opts.panels] PanelsApi from @tommy/panel-runtime (loader-injected)
 * @param {object} [opts.locales] this MP's bundled locale tables
 * @param {function} [opts.logSink] host log sink; defaults to console
 * @param {object} [opts.namespaces] host-provided implementations for stub
 *   namespaces (device, host, ui, lifecycle, …) — loader-injected per MP
 *   (M2 host-capability surface). Unknown keys are rejected; anything not
 *   provided stays a guard-throwing stub.
 */
export function buildSdk({ adapter, init, data, panels, locales, logSink, namespaces } = {}) {
  if (!adapter) throw new Error('buildSdk: adapter required');
  if (!init) throw new Error('buildSdk: init required');

  const mpId = init.mpId;
  const actions = createActionsApi({ adapter, mpId });

  const log = (level, msg, extra) => {
    try {
      const sink = logSink || ((lvl, ...rest) => {
        // eslint-disable-next-line no-console
        (console[lvl] || console.log)(...rest);
      });
      sink(level, `[mp:${mpId}]`, msg, extra);
    } catch (_) { /* logging must never throw */ }
  };

  const sdk = {
    init: Object.freeze({ ...init }),
    actions: guard(actions, 'actions'),
    data: data ? guard(data, 'data') : stubNamespace('data'),
    panels: panels ? guard(panels, 'panels') : stubNamespace('panels'),
    log,
    t: createT({ locales, locale: init.locale }),
    teardown: () => adapter.teardown(),
  };
  for (const name of STUB_NAMESPACES) sdk[name] = stubNamespace(name);

  if (namespaces) {
    for (const [name, impl] of Object.entries(namespaces)) {
      if (!STUB_NAMESPACES.includes(name)) throw new Error(`buildSdk: unknown namespace '${name}'`);
      if (impl) sdk[name] = guard(impl, name);
    }
  }

  return Object.freeze(guard(sdk, ''));
}
