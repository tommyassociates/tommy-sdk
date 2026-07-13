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
import { defineComponent, h, ref, onMounted, onBeforeUnmount } from 'vue';

export const LOAD_TIMEOUT_MS = 5000;
export const MAX_CONSECUTIVE_FAILURES = 3;

export const PanelTile = defineComponent({
  name: 'MpPanelTile',
  props: {
    def: { type: Object, required: true },      // PanelDefinition
    ctx: { type: Object, required: true },      // PanelContext
    loadTimeoutMs: { type: Number, default: LOAD_TIMEOUT_MS },
    onEvent: { type: Function, default: null }, // budget hooks: (event) => void
  },
  // Vue-child errors (an MP panel that mounts Vue into its shadow root can
  // still bubble here) are contained to this tile.
  errorCaptured(err) {
    this.fail(err);
    return false;
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
        await Promise.race([Promise.resolve(props.def.load(props.ctx)), timeout]);
        if (!alive) return;
        if (!shadowRoot) shadowRoot = mountEl.value.attachShadow({ mode: 'closed' });
        shadowRoot.replaceChildren();
        await props.def.render(shadowRoot, props.ctx);
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

    expose({ retry, fail });

    return () => h('div', { class: ['mp-panel-tile', `mp-panel-tile--${status.value}`], 'data-panel-id': props.def.id }, [
      // The MP's shadow-root mount point is ALWAYS present (render targets it);
      // skeleton/fallback overlays it while not ready.
      h('div', { class: 'mp-panel-tile__content', ref: mountEl, style: status.value === 'ready' ? undefined : { display: 'none' } }),
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
