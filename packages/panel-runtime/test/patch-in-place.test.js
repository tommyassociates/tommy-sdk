/**
 * A surface re-mounted into the element it already fills keeps its app and
 * patches its tiles by key: an unchanged tile keeps its component instance
 * (it is never unmounted), a changed context arrives as a prop update, a
 * removed tile goes and an added one mounts. A world (account) change is
 * another host, which mounts fresh. Contract fixture J9-panel-slow-keeps-content
 * (the patch half).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { h } from 'vue';
import { createPanelHost } from '../src/index.js';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });
// Under jsdom, fileURLToPath rejects the URL objects it is given, so the path is read off import.meta.url.
const FIXTURE = JSON.parse(readFileSync(join(dirname(decodeURIComponent(new globalThis.URL(import.meta.url).pathname)), 'fixtures/hds-contract/J9-panel-slow-keeps-content.json'), 'utf8'));

const lifecycle = { mounted: [], unmounted: [], instances: new Map() };
function componentDef(id) {
  return {
    id,
    component: {
      name: `Tile-${id}`,
      props: ['tommy', 'ctx'],
      mounted() { lifecycle.mounted.push(id); lifecycle.instances.set(id, this); },
      unmounted() { lifecycle.unmounted.push(id); },
      render() { return h('div', { class: 'tile-body', 'data-week': this.ctx?.config?.week ?? '' }, id); },
    },
  };
}

const panels = { a: { surfaces: ['dashboard'] }, b: { surfaces: ['dashboard'] }, c: { surfaces: ['dashboard'] } };
const entry = (id, panelId, config = {}) => ({ instance: { id, mpId: 'reports', panelId, config }, decl: panels[panelId], cell: { x: 0, y: 0, w: 4, h: 3 } });

describe('panel surface patch in place', () => {
  let el;
  beforeEach(() => {
    lifecycle.mounted.length = 0;
    lifecycle.unmounted.length = 0;
    lifecycle.instances.clear();
    el = document.createElement('div');
    document.body.append(el);
  });
  afterEach(() => { el.remove(); });

  function hostWithTiles() {
    const host = createPanelHost();
    const api = host.panelsApiFor('reports', panels, { firstParty: true });
    const defs = { a: componentDef('a'), b: componentDef('b'), c: componentDef('c') };
    Object.values(defs).forEach((def) => api.register(def));
    return { host, defs };
  }

  it('re-attach with one tile changed: the others keep their component instances', async () => {
    expect(FIXTURE.timeline[0]).toMatchObject({ event: 'patch' });
    const { host } = hostWithTiles();
    const first = host.mountSurface(el, { surface: 'dashboard', layout: [entry('i-1', 'a', { week: 1 }), entry('i-2', 'b', { week: 1 })] });
    await flush();
    expect(first.patched).toBe(false);
    const a = lifecycle.instances.get('a');
    const b = lifecycle.instances.get('b');
    const appRoot = el.firstElementChild;

    const again = host.mountSurface(el, { surface: 'dashboard', layout: [entry('i-1', 'a', { week: 1 }), entry('i-2', 'b', { week: 2 })] });
    await flush();
    expect(again.patched).toBe(true);
    expect(lifecycle.instances.get('a')).toBe(a);
    expect(lifecycle.instances.get('b')).toBe(b);
    expect(lifecycle.unmounted).toEqual([]);
    expect(lifecycle.mounted).toEqual(['a', 'b']);
    expect(el.firstElementChild).toBe(appRoot);
    // The changed context reached the kept instance as a prop update.
    expect(b.ctx.config.week).toBe(2);
    expect(el.querySelector('[data-instance-id="i-2"] .tile-body').getAttribute('data-week')).toBe('2');
  });

  it('a removed tile goes, an added one mounts, the rest stay', async () => {
    const { host } = hostWithTiles();
    host.mountSurface(el, { surface: 'dashboard', layout: [entry('i-1', 'a'), entry('i-2', 'b')] });
    await flush();
    const a = lifecycle.instances.get('a');
    host.mountSurface(el, { surface: 'dashboard', layout: [entry('i-1', 'a'), entry('i-3', 'c')] });
    await flush();
    expect(lifecycle.instances.get('a')).toBe(a);
    expect(lifecycle.unmounted).toEqual(['b']);
    expect(lifecycle.mounted).toEqual(['a', 'b', 'c']);
  });

  it('the previous mount\'s host cleanup runs after the patch; the new one runs at unmount', async () => {
    const { host } = hostWithTiles();
    const disposed = [];
    host.mountSurface(el, { surface: 'dashboard', layout: [entry('i-1', 'a')], onDispose: () => disposed.push('first') });
    await flush();
    host.mountSurface(el, { surface: 'dashboard', layout: [entry('i-1', 'a')], onDispose: () => disposed.push('second') });
    expect(disposed).toEqual(['first']);
    host.unmountSurface(el);
    expect(disposed).toEqual(['first', 'second']);
    expect(lifecycle.unmounted).toEqual(['a']);
  });

  it('a re-registered panel (a new definition) mounts fresh in place of the old one', async () => {
    const { host } = hostWithTiles();
    host.mountSurface(el, { surface: 'dashboard', layout: [entry('i-1', 'a')] });
    await flush();
    host.panelsApiFor('reports', panels, { firstParty: true }).register(componentDef('a'));
    host.mountSurface(el, { surface: 'dashboard', layout: [entry('i-1', 'a')] });
    await flush();
    expect(lifecycle.unmounted).toEqual(['a']);
    expect(lifecycle.mounted).toEqual(['a', 'a']);
  });

  it('an account change is another host: the surface mounts fresh', async () => {
    const teamA = hostWithTiles();
    teamA.host.mountSurface(el, { surface: 'dashboard', layout: [entry('i-1', 'a')] });
    await flush();
    teamA.host.unmountSurface(el);
    const teamB = hostWithTiles();
    const mountedB = teamB.host.mountSurface(el, { surface: 'dashboard', layout: [entry('i-1', 'a')] });
    await flush();
    expect(mountedB.patched).toBe(false);
    expect(lifecycle.mounted).toEqual(['a', 'a']);
    expect(lifecycle.unmounted).toEqual(['a']);
  });

  it('declaration mode patches too', async () => {
    const { host } = hostWithTiles();
    host.mountSurface(el, { surface: 'dashboard', ctxFor: (mpId, def) => ({ panelId: def.id, config: { week: 1 } }) });
    await flush();
    const a = lifecycle.instances.get('a');
    host.mountSurface(el, { surface: 'dashboard', ctxFor: (mpId, def) => ({ panelId: def.id, config: { week: 3 } }) });
    await flush();
    expect(lifecycle.instances.get('a')).toBe(a);
    expect(a.ctx.config.week).toBe(3);
    expect(lifecycle.unmounted).toEqual([]);
  });
});
