import { guard, TommyError, TommySDKError, isTommyError } from './errors.js';
import { createActionsApi } from './actions.js';
import { createT } from './i18n.js';

export { TommyError, TommySDKError, isTommyError } from './errors.js';
export { createDirectAdapter } from './adapter-direct.js';
export { DEFAULT_RPC_TIMEOUT_MS, DEFAULT_WRITE_TIMEOUT_MS, WRITE_RPC_KINDS } from './adapter.js';
export { createChatSendFeedback, CHAT_SEND_NOTICE_MS } from './chat-send-feedback.js';
export { visibleChatMessageIds, visibleChatConversationIds } from './chat-viewport.js';
export { default as createDisplayOwner } from './display-owner.js';

const STUB_NAMESPACES = [
  'ui', 'directory', 'device', 'host', 'navigation', 'theme', 'messaging',
  'clock', 'lifecycle', 'notifications', 'session', 'user', 'billing',
  // No cross-MP read here: another MP's setting comes only through a declared source.
  'settings',
  // Kept per account on the device by the host instead of browser storage.
  'prefs',
  // Tour registration is not here: the host registers declared tours, which the publish checker vets.
  'tours',
  'calls',
  'identity',
  'time',
];

function stubNamespace(name) {
  return guard({}, name);
}

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
