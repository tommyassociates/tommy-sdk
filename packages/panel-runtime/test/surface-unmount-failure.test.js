import { describe, it, expect, afterEach } from 'vitest';
import { h, nextTick } from 'vue';
import { createPanelHost } from '../src/index.js';

const manifestPanels = { tile: { surfaces: ['dashboard'] } };
const flush = async () => {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await nextTick();
  }
};

function surfaceWith(host, el, component) {
  const api = host.panelsApiFor('mp-x', manifestPanels, { firstParty: true });
  api.register({ id: 'tile', component });
  host.mountSurface(el, { surface: 'dashboard', ctxFor: (_mp, def) => ({ panelId: def.id, tommy: {} }) });
}

describe('a surface whose app fails to unmount', () => {
  afterEach(() => { document.body.replaceChildren(); });

  it('frees its element for the next host', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const broken = createPanelHost();
    surfaceWith(broken, el, { render: () => h('p', 'old') });
    await flush();
    el._vnode.component.subTree.children.push(null);
    expect(() => el._vnode.component.subTree.children.forEach(({ type }) => type)).toThrow(TypeError);

    expect(() => broken.unmountSurface(el)).not.toThrow();
    expect(broken.isSurfaceMounted(el)).toBe(false);

    const next = createPanelHost();
    expect(() => surfaceWith(next, el, { render: () => h('p', { class: 'fresh' }, 'new') })).not.toThrow();
    await flush();
    expect(el.querySelector('.fresh')?.textContent).toBe('new');
    next.unmountSurface(el);
  });
});
