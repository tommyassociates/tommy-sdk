/**
 * component-panel.test.js (ac2/ac3) — the `component` mount path.
 *
 * A panel may register a Vue/F7 `component` (instead of a plain-DOM
 * `render(root)`). The host mounts it in LIGHT DOM inside an F7-enabled surface
 * app so `f7-*` globals resolve; the plain-DOM path is untouched; a throwing
 * component is contained to its tile; unmounting the surface leaves no orphan.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h, resolveComponent } from 'vue';
import { createPanelHost } from '../src/index.js';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

const manifestPanels = {
  'comp-tile': { surfaces: ['dashboard'] },
  'dom-tile': { surfaces: ['dashboard'] },
};

// Stand-in for a Framework7-Vue global component, registered on the surface app
// by the host-supplied installer (the real one runs Framework7Vue +
// registerComponents). Its presence proves `f7-*` resolve inside a tile.
const F7ListStub = { name: 'f7-list', render() { return h('div', { class: 'stub-f7-list' }, 'list'); } };
const installComponentRuntime = (app) => { app.component('f7-list', F7ListStub); };

// A component panel that renders a GLOBAL `f7-list` (only resolves if the
// surface app installed the F7 runtime) and reads its injected `tommy`/`ctx`.
function componentDef(id, { onMounted: onMountedSpy } = {}) {
  return {
    id,
    component: {
      name: `Comp-${id}`,
      props: ['tommy', 'ctx'],
      mounted() { if (onMountedSpy) onMountedSpy(this.tommy, this.ctx); },
      // resolveComponent mirrors what a compiled SFC template emits for a global
      // `<f7-list>` — it looks up the surface app's registry (installComponentRuntime).
      render() { return h('div', { class: 'comp-body' }, [h(resolveComponent('f7-list')), h('span', { class: 'panel-id' }, this.ctx?.panelId)]); },
    },
  };
}

function throwingComponentDef(id) {
  return {
    id,
    component: { name: `Boom-${id}`, setup() { throw new Error('component exploded'); }, render() { return h('div'); } },
  };
}

function domDef(id, body = 'plain') {
  return { id, load: vi.fn(async () => {}), render: (root) => { const p = document.createElement('p'); p.textContent = body; root.append(p); } };
}

describe('component panel path', () => {
  let host; let el; let events;

  beforeEach(() => {
    events = [];
    host = createPanelHost({ onEvent: (e) => events.push(e), installComponentRuntime });
    el = document.createElement('div');
    document.body.append(el);
  });
  afterEach(() => { document.body.replaceChildren(); });

  it('mounts a component in light DOM with f7-* resolved, alongside a plain-DOM tile', async () => {
    const api = host.panelsApiFor('mp-x', manifestPanels, { firstParty: true });
    const tommy = { actions: {}, data: {} };
    api.register(componentDef('comp-tile'));
    api.register(domDef('dom-tile', 'plain-alive'));

    host.mountSurface(el, {
      surface: 'dashboard',
      ctxFor: (_mp, def) => ({ panelId: def.id, surface: 'dashboard', tommy, online: true }),
    });
    await flush();

    const comp = el.querySelector('[data-panel-id="comp-tile"]');
    // Light DOM: the component content is directly queryable (NOT behind a
    // closed shadow root, which querySelector could not pierce).
    expect(comp.className).toContain('mp-panel-tile--ready');
    expect(comp.querySelector('.comp-body')).toBeTruthy();
    expect(comp.querySelector('.stub-f7-list')?.textContent).toBe('list');   // f7-* resolved
    expect(comp.querySelector('.panel-id')?.textContent).toBe('comp-tile');   // ctx flowed in

    // The plain-DOM path is unaffected (renders into its shadow root).
    const dom = el.querySelector('[data-panel-id="dom-tile"]');
    expect(dom.className).toContain('mp-panel-tile--ready');
  });

  it('does NOT expose $api / $store / Vuex to a component MP (contract-only data)', async () => {
    const captured = {};
    const api = host.panelsApiFor('mp-x', manifestPanels, { firstParty: true });
    const tommy = { actions: {}, data: {}, host: {} };
    api.register({
      id: 'comp-tile',
      component: {
        name: 'Probe',
        props: ['tommy', 'ctx'],
        mounted() {
          captured.$api = this.$api;
          captured.$store = this.$store;
          captured.optionsStore = this.$options.store;
          captured.tommy = this.tommy;
        },
        render() { return h('div'); },
      },
    });
    host.mountSurface(el, { surface: 'dashboard', ctxFor: (_mp, def) => ({ panelId: def.id, tommy }) });
    await flush();
    // The surface app is a SEPARATE Vue app that installs only F7 + $f7 — the
    // main app's $api / $store / Vuex plugin are never on it. Data must flow
    // through the injected `tommy` (tommy.actions / tommy.data / tommy.host).
    expect(captured.$api).toBeUndefined();
    expect(captured.$store).toBeUndefined();
    expect(captured.optionsStore).toBeUndefined();
    expect(captured.tommy).toBe(tommy);
  });

  it('passes tommy + ctx into the component', async () => {
    const onMountedSpy = vi.fn();
    const api = host.panelsApiFor('mp-x', manifestPanels, { firstParty: true });
    const tommy = { marker: 'the-sdk' };
    api.register(componentDef('comp-tile', { onMounted: onMountedSpy }));
    host.mountSurface(el, { surface: 'dashboard', ctxFor: (_mp, def) => ({ panelId: def.id, tommy, online: true }) });
    await flush();
    expect(onMountedSpy).toHaveBeenCalledTimes(1);
    expect(onMountedSpy.mock.calls[0][0]).toBe(tommy);
    expect(onMountedSpy.mock.calls[0][1].panelId).toBe('comp-tile');
  });

  it('enforces component XOR render at registration', () => {
    const api = host.panelsApiFor('mp-x', manifestPanels, { firstParty: true });
    expect(() => api.register({ id: 'comp-tile' })).toThrow(/exactly one of 'component' or 'render'/);
    expect(() => api.register({ id: 'comp-tile', component: {}, render() {} })).toThrow(/exactly one/);
    // exactly one is fine:
    expect(() => api.register({ id: 'comp-tile', component: { render() { return h('div'); } } })).not.toThrow();
    expect(() => api.register({ id: 'dom-tile', render() {} })).not.toThrow();
  });

  it('gates the component path to first-party MPs (untrusted must use render)', () => {
    const untrusted = host.panelsApiFor('mp-untrusted', manifestPanels, { firstParty: false });
    expect(() => untrusted.register({ id: 'comp-tile', component: { render() { return h('div'); } } }))
      .toThrow(/first-party only/);
    // …but the shadow-isolated render path stays open to untrusted MPs.
    expect(() => untrusted.register({ id: 'dom-tile', render() {} })).not.toThrow();
  });

  it('CONTAINS a throwing component to its tile — sibling component keeps rendering (ac3)', async () => {
    const api = host.panelsApiFor('mp-x', manifestPanels, { firstParty: true });
    api.register(throwingComponentDef('comp-tile'));
    api.register(componentDef('dom-tile'));
    host.mountSurface(el, { surface: 'dashboard', ctxFor: (_mp, def) => ({ panelId: def.id, online: true }) });
    await flush();

    const broken = el.querySelector('[data-panel-id="comp-tile"]');
    const healthy = el.querySelector('[data-panel-id="dom-tile"]');
    expect(broken.className).toContain('mp-panel-tile--error');
    expect(broken.textContent).toContain("This panel couldn't load.");
    expect(healthy.className).toContain('mp-panel-tile--ready');
    expect(healthy.querySelector('.comp-body')).toBeTruthy();
  });

  it('unmounting the surface leaves no orphaned component app (ac3)', async () => {
    const unmountSpy = vi.fn();
    const api = host.panelsApiFor('mp-x', manifestPanels, { firstParty: true });
    api.register({
      id: 'comp-tile',
      component: { name: 'Tracked', unmounted() { unmountSpy(); }, render() { return h('div', { class: 'tracked' }); } },
    });
    host.mountSurface(el, { surface: 'dashboard', ctxFor: (_mp, def) => ({ panelId: def.id }) });
    await flush();
    expect(el.querySelector('.tracked')).toBeTruthy();

    host.unmountSurface(el);
    expect(unmountSpy).toHaveBeenCalledTimes(1);
    expect(el.querySelector('.tracked')).toBeNull();
  });
});
