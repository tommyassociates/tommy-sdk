/**
 * panel-tile.js — one host-owned grid tile (panel-runtime.md §2).
 *
 * The host paints the skeleton INSTANTLY; the MP's panel definition fills a
 * Shadow-DOM root when its `load()` resolves (progressive reveal). Runtime
 * budgets per harden round-1: §2 only — 5 s per-panel load timeout, Retry
 * re-runs load, 3 consecutive failures escalate to a "Reload add-on" state.
 * (§8's 30 KB/200 ms/5 MB are review/harness checks, NOT runtime-enforced.)
 *
 * Containment: load/render failures are caught here (the M0 boundary pattern
 * — a broken panel is a fallback tile, siblings keep running) and reported
 * through the budget-hook event stream.
 */
import { defineComponent, h, ref, onMounted, onBeforeUnmount, onErrorCaptured } from 'vue';

export const LOAD_TIMEOUT_MS = 5000;
export const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Base stylesheet adopted into every panel shadow root.
 *
 * MP panels render plain DOM (h3/ul/li/p/button) into their (closed) shadow
 * root — a boundary host stylesheets do NOT cross. Without a sheet the content
 * falls back to UA defaults (raw bullets, unstyled buttons). CSS custom
 * properties (the `--tommy-*` design tokens declared on :root) DO pierce the
 * boundary, so this token-based sheet gives every MP a consistent, card-like
 * look that sits next to the first-party dashboard cards. Adopted via
 * `adoptedStyleSheets` because the MPs' `render()` calls `replaceChildren()`,
 * which would wipe an injected <style> node but leaves adopted sheets intact.
 */
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
  sharedBaseSheet = false; // memoise the unsupported case
  return false;
}

/** Give a shadow root the base panel look (adopted sheet, or a <style> fallback). */
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
  // Fallback: constructable sheets unavailable. A <style> node is wiped by the
  // MP's replaceChildren(); it is re-applied after each render (see boot()).
  const style = document.createElement('style');
  style.setAttribute('data-mp-panel-base', '');
  style.textContent = PANEL_BASE_CSS.replace(/:host/g, ':host, :root');
  shadowRoot.append(style);
}

export const PanelTile = defineComponent({
  name: 'MpPanelTile',
  props: {
    def: { type: Object, required: true },      // PanelDefinition
    ctx: { type: Object, required: true },      // PanelContext
    loadTimeoutMs: { type: Number, default: LOAD_TIMEOUT_MS },
    onEvent: { type: Function, default: null }, // budget hooks: (event) => void
  },
  setup(props, { expose }) {
    const status = ref('loading'); // loading | ready | error | reload_addon
    const failures = ref(0);
    const mountEl = ref(null);
    let shadowRoot = null;
    let alive = true;

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
      status.value = 'loading';
      emitEvent('panel-load-start');
      const startedAt = Date.now();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`panel '${props.def.id}' load exceeded ${props.loadTimeoutMs}ms`)), props.loadTimeoutMs);
      });
      try {
        // Optional prefetch — both paths may declare load(). The component path
        // usually fetches inside the component's setup() via `tommy` instead.
        if (props.def.load) {
          await Promise.race([Promise.resolve(props.def.load(props.ctx)), timeout]);
        }
        if (!alive) return;
        if (props.def.component) {
          // Component path: mount a Vue/F7 component declaratively into the
          // LIGHT-DOM content node (the render fn renders it once ready). No
          // shadow root (F7's global CSS can't cross a closed shadow boundary),
          // no def.render. Render errors are contained by onErrorCaptured below.
          status.value = 'ready';
          failures.value = 0;
          emitEvent('panel-ready', { durationMs: Date.now() - startedAt });
          return;
        }
        if (!shadowRoot) {
          shadowRoot = mountEl.value.attachShadow({ mode: 'closed' });
          // DEV-ONLY escape hatch: closed shadow roots are unreachable from
          // Playwright/devtools — expose the root on the mount element in dev
          // builds so e2e can drive panel content. Absent in production.
          try {
            if (import.meta.env && import.meta.env.DEV) mountEl.value.__mpShadowRoot = shadowRoot;
          } catch (_) { /* no import.meta.env outside vite */ }
        }
        shadowRoot.replaceChildren();
        await props.def.render(shadowRoot, props.ctx);
        // Base look for the MP's plain DOM. Applied AFTER render: the MP's
        // render() typically calls replaceChildren() on the root, which wipes a
        // <style> fallback node — the adopted-sheet path is idempotent.
        applyPanelBaseStyles(shadowRoot);
        if (!alive) return;
        status.value = 'ready';
        failures.value = 0;
        emitEvent('panel-ready', { durationMs: Date.now() - startedAt });
      } catch (cause) {
        if (alive) fail(cause);
      } finally {
        clearTimeout(timer);
      }
    }

    function retry() {
      emitEvent('panel-retry', { attempt: failures.value + 1 });
      boot();
    }

    onMounted(boot);
    onBeforeUnmount(() => {
      alive = false;
      try { if (props.def.unmount) props.def.unmount(); } catch (_) { /* contained */ }
    });
    // The tile IS the error boundary: a component-path child (or a Vue-in-shadow
    // render-path MP) that throws during render/setup/lifecycle is contained
    // here — the tile enters its error/retry state, siblings keep running.
    onErrorCaptured((err) => {
      if (alive) fail(err);
      return false;
    });

    expose({ retry, fail });

    return () => h('div', { class: ['mp-panel-tile', `mp-panel-tile--${status.value}`], 'data-panel-id': props.def.id }, [
      // Component path: the registered Vue/F7 component mounts as a light-DOM
      // child once ready (only then — so a re-throw can't reopen after fail()).
      // Plain-DOM path: the shadow-root mount point is ALWAYS present (render
      // targets it); skeleton/fallback overlays it while not ready.
      props.def.component
        ? h('div', { class: 'mp-panel-tile__content', style: status.value === 'ready' ? undefined : { display: 'none' } },
          status.value === 'ready' ? [h(props.def.component, { tommy: props.ctx && props.ctx.tommy, ctx: props.ctx })] : [])
        : h('div', { class: 'mp-panel-tile__content', ref: mountEl, style: status.value === 'ready' ? undefined : { display: 'none' } }),
      status.value === 'loading'
        ? h('div', { class: 'mp-panel-tile__skeleton', 'aria-busy': 'true' }, [h('div', { class: 'mp-panel-skeleton-bar' }), h('div', { class: 'mp-panel-skeleton-bar' })])
        : null,
      status.value === 'error'
        ? h('div', { class: 'mp-panel-tile__error' }, [
          h('p', "This panel couldn't load."),
          h('button', { class: 'mp-panel-tile__retry', onClick: retry }, 'Retry'),
        ])
        : null,
      status.value === 'reload_addon'
        ? h('div', { class: 'mp-panel-tile__reload' }, [h('p', 'Reload add-on')])
        : null,
    ]);
  },
});
