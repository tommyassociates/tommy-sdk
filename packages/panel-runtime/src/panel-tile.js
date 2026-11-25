import { defineComponent, h, ref, watch, onMounted, onBeforeUnmount, onErrorCaptured } from 'vue';
import { isStaleWorldRefusal } from './stale-world.js';

export const LOAD_TIMEOUT_MS = 5000;
export const MAX_CONSECUTIVE_FAILURES = 3;

export const DEFAULT_TILE_LABELS = Object.freeze({
  stale: "Couldn't refresh — showing the last view",
  retry: 'Try again',
  slow: 'Taking longer than usual…',
});

// Live objects, not displayed data: a new one alone never reloads the tile.
const LIVE_CONTEXT_FIELDS = new Set(['tommy', 'chatPane', 'chatThreadPane', 'chatList']);

function contextSignature(ctx) {
  try {
    return JSON.stringify(ctx ?? null, (key, value) => {
      if (typeof value === 'function') return undefined;
      if (LIVE_CONTEXT_FIELDS.has(key)) return undefined;
      return value;
    });
  } catch (_) {
    return null;
  }
}

// Host stylesheets cannot cross the closed shadow root but tokens do, so this sheet styles MP panel DOM.
const PANEL_BASE_CSS = `
:host {
  display: block;
  font-family: var(--tommy-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
  font-size: var(--tommy-font-size, 14px);
  color: var(--tommy-text-dark, #252222);
  line-height: 1.4;
}
* { box-sizing: border-box; }
h1, h2, h3, h4 {
  margin: 0 0 12px;
  font-weight: 600;
  color: var(--tommy-text-black, #0a0d14);
}
h2 { font-size: 18px; }
h3 { font-size: 16px; }
h4 { font-size: 14px; }
p { margin: 0 0 8px; color: var(--tommy-text-medium, #7E7F8F); }
p:last-child { margin-bottom: 0; }
ul, ol { list-style: none; margin: 0; padding: 0; }
li {
  padding: 8px 0;
  border-bottom: 1px solid var(--tommy-border-color, #e5e5e5);
}
li:last-child { border-bottom: 0; }
a { color: var(--tommy-link-color, #635bff); text-decoration: none; }
button {
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 12px;
  margin: 4px 6px 4px 0;
  border: 1px solid var(--tommy-border-color, #e5e5e5);
  border-radius: var(--tommy-border-radius, 8px);
  background: var(--tommy-surface, #fff);
  color: var(--tommy-text-dark, #252222);
  cursor: pointer;
}
button:hover { background: var(--tommy-bg-lightest, #fafafa); }
button.is-active {
  background: var(--tommy-theme-color, #635bff);
  border-color: var(--tommy-theme-color, #635bff);
  color: #fff;
}
input {
  font-family: inherit;
  font-size: 14px;
  padding: 8px 10px;
  margin: 4px 0;
  width: 100%;
  border: 1px solid var(--tommy-border-color, #e5e5e5);
  border-radius: var(--tommy-border-radius, 8px);
  background: var(--tommy-surface, #fff);
  color: var(--tommy-text-dark, #252222);
}

/* Summary rows (icon · label · trailing value · chevron) — the shared markup
   MPs opt into to match the first-party dashboard cards (Documents, etc.).
   Icons are host-owned CSS masks so MPs only set a data-icon; no icon fonts
   or SVG cross the shadow boundary. */
ul.mp-rows { padding: 4px 0 0; }
li.mp-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
}
li.mp-row--link { cursor: pointer; }
li.mp-row--link:hover .mp-row__label { color: var(--tommy-text-black, #0a0d14); }
.mp-row__icon {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  background-color: var(--tommy-text-dark, #252222);
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-position: center; mask-position: center;
  -webkit-mask-size: contain; mask-size: contain;
}
.mp-row__label { flex: 1 1 auto; color: var(--tommy-text-dark, #252222); }
/* A clickable row label (e.g. a member name) reads as text, not a button. */
button.mp-row__label {
  border: 0;
  background: none;
  padding: 0;
  margin: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
button.mp-row__label:hover { background: none; color: var(--tommy-text-black, #0a0d14); }
.mp-row__value {
  flex: 0 0 auto;
  color: var(--tommy-text-medium, #7E7F8F);
  font-variant-numeric: tabular-nums;
}
.mp-row__chevron {
  flex: 0 0 auto;
  width: 8px;
  height: 14px;
  margin-left: 2px;
  background-color: var(--tommy-text-light, #999999);
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-position: center; mask-position: center;
  -webkit-mask-size: contain; mask-size: contain;
  -webkit-mask-image: var(--mp-icon-chevron); mask-image: var(--mp-icon-chevron);
}
.mp-row__icon[data-icon="clock"] { -webkit-mask-image: var(--mp-icon-clock); mask-image: var(--mp-icon-clock); }
.mp-row__icon[data-icon="file-text"] { -webkit-mask-image: var(--mp-icon-file-text); mask-image: var(--mp-icon-file-text); }
.mp-row__icon[data-icon="send"] { -webkit-mask-image: var(--mp-icon-send); mask-image: var(--mp-icon-send); }
.mp-row__icon[data-icon="x-circle"] { -webkit-mask-image: var(--mp-icon-x-circle); mask-image: var(--mp-icon-x-circle); }
.mp-row__icon[data-icon="check-circle"] { -webkit-mask-image: var(--mp-icon-check-circle); mask-image: var(--mp-icon-check-circle); }
.mp-row__icon[data-icon="list"] { -webkit-mask-image: var(--mp-icon-list); mask-image: var(--mp-icon-list); }
.mp-row__icon[data-icon="inbox"] { -webkit-mask-image: var(--mp-icon-inbox); mask-image: var(--mp-icon-inbox); }
.mp-row__icon[data-icon="user-check"] { -webkit-mask-image: var(--mp-icon-user-check); mask-image: var(--mp-icon-user-check); }
.mp-row__icon[data-icon="user"] { -webkit-mask-image: var(--mp-icon-user); mask-image: var(--mp-icon-user); }
:host {
  --mp-icon-clock: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><polyline points='12 6 12 12 16 14'/></svg>");
  --mp-icon-file-text: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='16' y1='13' x2='8' y2='13'/><line x1='16' y1='17' x2='8' y2='17'/><line x1='10' y1='9' x2='8' y2='9'/></svg>");
  --mp-icon-send: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='22' y1='2' x2='11' y2='13'/><polygon points='22 2 15 22 11 13 2 9 22 2'/></svg>");
  --mp-icon-x-circle: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><line x1='15' y1='9' x2='9' y2='15'/><line x1='9' y1='9' x2='15' y2='15'/></svg>");
  --mp-icon-check-circle: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M22 11.08V12a10 10 0 1 1-5.93-9.14'/><polyline points='22 4 12 14.01 9 11.01'/></svg>");
  --mp-icon-list: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='8' y1='6' x2='21' y2='6'/><line x1='8' y1='12' x2='21' y2='12'/><line x1='8' y1='18' x2='21' y2='18'/><line x1='3' y1='6' x2='3.01' y2='6'/><line x1='3' y1='12' x2='3.01' y2='12'/><line x1='3' y1='18' x2='3.01' y2='18'/></svg>");
  --mp-icon-inbox: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='22 12 16 12 14 15 10 15 8 12 2 12'/><path d='M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'/></svg>");
  --mp-icon-user-check: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='8.5' cy='7' r='4'/><polyline points='17 11 19 13 23 9'/></svg>");
  --mp-icon-user: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/></svg>");
  --mp-icon-chevron: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 18 15 12 9 6'/></svg>");
}
`;

let sharedBaseSheet = null;
function baseSheet() {
  if (sharedBaseSheet !== null) return sharedBaseSheet;
  try {
    if (typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(PANEL_BASE_CSS);
      sharedBaseSheet = sheet;
      return sheet;
    }
  } catch (_) { /* adoptedStyleSheets unsupported — fall through */ }
  sharedBaseSheet = false;
  return false;
}

export function applyPanelBaseStyles(shadowRoot) {
  const sheet = baseSheet();
  if (sheet) {
    try {
      if (!shadowRoot.adoptedStyleSheets.includes(sheet)) {
        shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
      }
      return;
    } catch (_) { /* fall through to <style> */ }
  }
  const style = document.createElement('style');
  style.setAttribute('data-mp-panel-base', '');
  style.textContent = PANEL_BASE_CSS.replace(/:host/g, ':host, :root');
  shadowRoot.append(style);
}

// Vue runs data() outside its error wrapping, where onErrorCaptured cannot see the throw, so guard it here.
function guardPanelData(component, onDataError) {
  if (!component || typeof component !== 'object' || typeof component.data !== 'function') return component;
  const failed = new WeakSet();
  const { data, render } = component;
  const guarded = {
    ...component,
    data(vm) {
      try {
        return data.call(this, vm);
      } catch (err) {
        if (isStaleWorldRefusal(err)) throw err;
        failed.add(this.$);
        onDataError(err);
        return {};
      }
    },
  };
  if (typeof render === 'function') {
    guarded.render = function guardedRender(...args) {
      return failed.has(this.$) ? null : render.apply(this, args);
    };
  }
  return guarded;
}

export const PanelTile = defineComponent({
  name: 'MpPanelTile',
  props: {
    def: { type: Object, required: true },
    ctx: { type: Object, required: true },
    loadTimeoutMs: { type: Number, default: LOAD_TIMEOUT_MS },
    onClose: { type: Function, default: null },
    closeLabel: { type: String, default: 'Close' },
    labels: { type: Object, default: null },
    onEvent: { type: Function, default: null },
  },
  setup(props, { expose }) {
    const status = ref('loading');
    const failures = ref(0);
    const mountEl = ref(null);
    const rendered = ref(false);
    const stale = ref(false);
    const slow = ref(false);
    let alive = true;
    let bootSeq = 0;
    const label = (key) => (props.labels && typeof props.labels[key] === 'string' && props.labels[key]) || DEFAULT_TILE_LABELS[key];

    const emitEvent = (type, extra = {}) => {
      try {
        if (props.onEvent) props.onEvent({ type, panelId: props.def.id, at: Date.now(), ...extra });
      } catch (_) { /* hooks must never break the tile */ }
    };

    function fail(cause) {
      failures.value += 1;
      status.value = failures.value >= MAX_CONSECUTIVE_FAILURES ? 'reload_addon' : 'error';
      emitEvent(status.value === 'reload_addon' ? 'panel-reload-required' : 'panel-error', {
        message: String(cause && cause.message), failures: failures.value,
      });
    }

    async function boot() {
      bootSeq += 1;
      const seq = bootSeq;
      const current = () => alive && seq === bootSeq;
      const keep = rendered.value && (status.value === 'ready');
      if (!keep) status.value = 'loading';
      stale.value = false;
      slow.value = false;
      emitEvent('panel-load-start');
      const startedAt = Date.now();
      // Time alone is never an error: past the timeout the tile says so and waits.
      const timer = setTimeout(() => {
        if (!current()) return;
        if (keep) stale.value = true; else slow.value = true;
        emitEvent(keep ? 'panel-stale' : 'panel-slow', { afterMs: props.loadTimeoutMs });
      }, props.loadTimeoutMs);
      try {
        if (props.def.load) {
          await Promise.resolve(props.def.load(props.ctx));
        }
        if (!current()) return;
        if (props.def.component) {
          // No shadow root on the component path: F7's global CSS cannot cross a closed shadow boundary.
          status.value = 'ready';
          rendered.value = true;
          stale.value = false;
          slow.value = false;
          failures.value = 0;
          emitEvent('panel-ready', { durationMs: Date.now() - startedAt });
          return;
        }
        // Each render draws into its own hidden host; the current one replaces the shown host, keeping the root it drew into.
        const surface = document.createElement('div');
        surface.className = 'mp-panel-tile__surface';
        surface.hidden = true;
        const root = surface.attachShadow({ mode: 'closed' });
        mountEl.value.append(surface);
        try {
          await props.def.render(root, props.ctx);
          applyPanelBaseStyles(root);
        } catch (cause) {
          surface.remove();
          throw cause;
        }
        if (!current()) { surface.remove(); return; }
        for (const child of [...mountEl.value.children]) if (child !== surface) child.remove();
        surface.hidden = false;
        try {
          if (import.meta.env && import.meta.env.DEV) mountEl.value.__mpShadowRoot = root;
        } catch (_) { /* no import.meta.env outside vite */ }
        status.value = 'ready';
        rendered.value = true;
        stale.value = false;
        slow.value = false;
        failures.value = 0;
        emitEvent('panel-ready', { durationMs: Date.now() - startedAt });
      } catch (cause) {
        if (current()) {
          stale.value = false;
          slow.value = false;
          fail(cause);
        }
      } finally {
        clearTimeout(timer);
      }
    }

    watch(() => contextSignature(props.ctx), (next, previous) => {
      if (next === previous || !alive) return;
      if (status.value === 'ready' || status.value === 'loading') boot();
    });

    function retry() {
      emitEvent('panel-retry', { attempt: failures.value + 1 });
      boot();
    }

    onMounted(boot);
    onBeforeUnmount(() => {
      alive = false;
      try { if (props.def.unmount) props.def.unmount(); } catch (_) { /* contained */ }
    });
    // The tile is the error boundary, except a stale-world refusal, which is not the panel's fault and changes nothing.
    onErrorCaptured((err) => {
      if (isStaleWorldRefusal(err)) return false;
      if (alive) fail(err);
      return false;
    });

    expose({ retry, fail });

    const panelComponent = guardPanelData(props.def.component, (err) => { if (alive) fail(err); });

    const closeButton = () => props.onClose
      ? h('button', { class: 'mp-panel-tile__close', 'data-cy': 'mp-panel-error-close', onClick: props.onClose }, props.closeLabel)
      : null;

    return () => h('div', { class: ['mp-panel-tile', `mp-panel-tile--${status.value}`], 'data-panel-id': props.def.id }, [
      props.def.component
        ? h('div', { class: 'mp-panel-tile__content', style: status.value === 'ready' ? undefined : { display: 'none' } },
          status.value === 'ready' ? [h(panelComponent, { tommy: props.ctx && props.ctx.tommy, ctx: props.ctx })] : [])
        : h('div', { class: 'mp-panel-tile__content', ref: mountEl, style: status.value === 'ready' ? undefined : { display: 'none' } }),
      status.value === 'loading'
        ? h('div', { class: 'mp-panel-tile__skeleton', 'aria-busy': 'true' }, [
          h('div', { class: 'mp-panel-skeleton-bar' }),
          h('div', { class: 'mp-panel-skeleton-bar' }),
          slow.value ? h('p', { class: 'mp-panel-tile__slow', role: 'status', 'data-cy': 'mp-panel-slow-notice' }, label('slow')) : null,
        ])
        : null,
      status.value === 'ready' && stale.value
        ? h('div', { class: 'mp-panel-tile__stale', role: 'status', 'data-cy': 'mp-panel-stale-notice' }, [
          h('span', { class: 'mp-panel-tile__stale-text' }, label('stale')),
          h('button', {
            class: 'mp-panel-tile__stale-retry',
            type: 'button',
            'data-cy': 'mp-panel-stale-retry-button',
            style: { minWidth: '24px', minHeight: '24px' },
            onClick: retry,
          }, label('retry')),
        ])
        : null,
      status.value === 'error'
        ? h('div', { class: 'mp-panel-tile__error' }, [
          h('p', "This panel couldn't load."),
          h('button', { class: 'mp-panel-tile__retry', onClick: retry }, 'Retry'),
          closeButton(),
        ])
        : null,
      status.value === 'reload_addon'
        ? h('div', { class: 'mp-panel-tile__reload' }, [h('p', 'Reload add-on'), closeButton()])
        : null,
    ]);
  },
});
