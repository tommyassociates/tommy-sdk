import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h, nextTick } from 'vue';
import { createPanelHost } from '../src/index.js';

const flush = async () => {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await nextTick();
  }
};

const timezoneStale = () => Object.assign(new RangeError('TIMEZONE_CONTEXT_STALE'), { code: 'TIMEZONE_CONTEXT_STALE' });

const manifestPanels = { tile: { surfaces: ['dashboard'] }, sibling: { surfaces: ['dashboard'] } };

describe('a panel whose data() throws while its tile mounts it', () => {
  let host; let el; let events; let warn;
  let refusal;

  beforeEach(() => {
    events = [];
    refusal = null;
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    el = document.createElement('div');
    document.body.append(el);
  });
  afterEach(() => {
    host.unmountSurface(el);
    document.body.replaceChildren();
    warn.mockRestore();
  });

  const tile = () => el.querySelector('[data-panel-id="tile"]');
  const panelErrors = () => events.filter((e) => e.type === 'panel-error' || e.type === 'panel-reload-required');
  const unhandledWarns = () => warn.mock.calls.filter((args) => String(args[0]).includes('Unhandled error'));

  const panel = {
    name: 'DataPanel',
    data() {
      if (refusal) throw refusal();
      return { zone: 'Australia/Sydney' };
    },
    render() { return h('div', { class: 'panel-body' }, this.zone); },
  };

  function mount(installComponentRuntime) {
    host = createPanelHost({ onEvent: (e) => events.push(e), installComponentRuntime });
    const api = host.panelsApiFor('mp-x', manifestPanels, { firstParty: true });
    api.register({ id: 'tile', component: panel });
    api.register({ id: 'sibling', component: { render: () => h('p', { class: 'sibling-body' }, 'sibling') } });
    host.mountSurface(el, { surface: 'dashboard', ctxFor: (_mp, def) => ({ panelId: def.id, tommy: {} }) });
  }

  it('a stale-world refusal is quiet: no warning, no error card, no panel-error, nothing to the host handler', async () => {
    const errorHandler = vi.fn();
    refusal = timezoneStale;
    mount((app) => { app.config.errorHandler = errorHandler; });
    await flush();
    expect(errorHandler).not.toHaveBeenCalled();
    expect(unhandledWarns()).toEqual([]);
    expect(tile().querySelector('.mp-panel-tile__error')).toBeNull();
    expect(panelErrors()).toEqual([]);
    expect(el.querySelector('.sibling-body')).toBeTruthy();
  });

  it('a stale-world refusal with no host handler neither warns nor throws', async () => {
    refusal = timezoneStale;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mount();
      await flush();
      expect(unhandledWarns()).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
      expect(panelErrors()).toEqual([]);
    } finally { consoleError.mockRestore(); }
  });

  it('an ordinary error shows the tile its error card, and Retry mounts the panel once data() answers', async () => {
    const errorHandler = vi.fn();
    refusal = () => new Error('boom');
    mount((app) => { app.config.errorHandler = errorHandler; });
    await flush();
    expect(tile().querySelector('.mp-panel-tile__error')).toBeTruthy();
    expect(panelErrors().map((e) => e.message)).toEqual(['boom']);
    expect(errorHandler).not.toHaveBeenCalled();
    expect(el.querySelector('.sibling-body')).toBeTruthy();

    refusal = null;
    tile().querySelector('.mp-panel-tile__retry').click();
    await flush();
    expect(errorHandler).not.toHaveBeenCalled();
    expect(tile().querySelector('.mp-panel-tile__error')).toBeNull();
    expect(tile().querySelector('.panel-body').textContent).toBe('Australia/Sydney');
  });
});
