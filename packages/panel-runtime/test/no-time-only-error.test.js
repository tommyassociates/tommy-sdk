/**
 * Time alone is never a panel error. Past the load timeout, a tile that
 * already rendered keeps its content with a stale mark and Retry; a first boot
 * keeps its skeleton with a "taking longer" note; a late answer replaces
 * either; a real failure still shows the error card, and three in a row still
 * escalate. A changed context loads the tile again, keeping its content
 * meanwhile. Contract fixture J9-panel-slow-keeps-content.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createPanelHost, LOAD_TIMEOUT_MS } from '../src/index.js';

// Under jsdom, fileURLToPath rejects the URL objects it is given, so the path is read off import.meta.url.
const FIXTURE = JSON.parse(readFileSync(join(dirname(decodeURIComponent(new globalThis.URL(import.meta.url).pathname)), 'fixtures/hds-contract/J9-panel-slow-keeps-content.json'), 'utf8'));
const panels = { reports: { surfaces: ['dashboard'] } };
const entry = (config) => ({ instance: { id: 'i-1', mpId: 'reports', panelId: 'reports', config }, decl: panels.reports, cell: { x: 0, y: 0, w: 4, h: 3 } });

describe('no time-only panel error (J9-panel-slow-keeps-content)', () => {
  let el;
  let events;
  let host;
  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    host = createPanelHost({ onEvent: (event) => events.push(event) });
    el = document.createElement('div');
    document.body.append(el);
  });
  afterEach(() => { vi.useRealTimers(); el.remove(); });

  /** A plain-DOM panel whose load for a location answers when the test says so. */
  function slowPanel() {
    const pending = new Map();
    const def = {
      id: 'reports',
      load: vi.fn((ctx) => new Promise((resolve, reject) => { pending.set(ctx.config.location, { resolve, reject }); })),
      render: vi.fn((root, ctx) => { const p = document.createElement('p'); p.className = 'shown'; p.textContent = `location ${ctx.config.location}`; root.replaceChildren(p); }),
    };
    host.panelsApiFor('reports', panels).register(def);
    return { def, pending };
  }
  const tile = () => el.querySelector('[data-panel-id="reports"]');

  it('a re-attach whose load runs past 5 s keeps the previous render with a stale mark, then shows the new render', async () => {
    const [patch, at5s, at7s] = FIXTURE.timeline;
    const { def, pending } = slowPanel();
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'harbour' })] });
    pending.get('harbour').resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(tile().className).toContain('mp-panel-tile--ready');

    // The location filter changes: re-attach with a new context (patch, not remount).
    const result = host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'pier' })] });
    expect(result.patched).toBe(patch.event === 'patch');
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS + 10);
    expect(at5s.payload).toMatchObject({ mark: 'stale', retry: true });
    expect(tile().className).toContain('mp-panel-tile--ready');
    expect(tile().querySelector('[data-cy="mp-panel-stale-notice"]').textContent).toContain("Couldn't refresh — showing the last view");
    expect(tile().querySelector('[data-cy="mp-panel-stale-retry-button"]').textContent).toBe('Try again');
    expect(tile().textContent).not.toContain("This panel couldn't load.");
    expect(def.render).toHaveBeenCalledTimes(1);

    pending.get('pier').resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(at7s.payload).toMatchObject({ mark: null });
    expect(tile().querySelector('[data-cy="mp-panel-stale-notice"]')).toBeNull();
    expect(def.render).toHaveBeenCalledTimes(2);
    expect(def.render.mock.calls[1][1].config.location).toBe('pier');
    expect(events.some((e) => e.type === 'panel-error')).toBe(false);
  });

  it('Retry on the stale mark loads again and keeps the content', async () => {
    const { def, pending } = slowPanel();
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'harbour' })] });
    pending.get('harbour').resolve();
    await vi.advanceTimersByTimeAsync(0);
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'pier' })] });
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS + 10);
    tile().querySelector('[data-cy="mp-panel-stale-retry-button"]').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(def.load).toHaveBeenCalledTimes(3);
    expect(tile().className).toContain('mp-panel-tile--ready');
    expect(tile().querySelector('[data-cy="mp-panel-stale-notice"]')).toBeNull();
  });

  it('a first boot keeps the skeleton with the note, then shows the late render', async () => {
    const { pending } = slowPanel();
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'harbour' })] });
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS + 10);
    expect(tile().className).toContain('mp-panel-tile--loading');
    expect(tile().querySelector('[data-cy="mp-panel-slow-notice"]').textContent).toBe('Taking longer than usual…');
    pending.get('harbour').resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(tile().className).toContain('mp-panel-tile--ready');
    expect(tile().querySelector('[data-cy="mp-panel-slow-notice"]')).toBeNull();
  });

  it('a real failure still shows the error card, and three in a row escalate', async () => {
    const { pending } = slowPanel();
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'harbour' })] });
    pending.get('harbour').reject(new Error('boom'));
    await vi.advanceTimersByTimeAsync(0);
    expect(tile().className).toContain('mp-panel-tile--error');
    expect(tile().textContent).toContain("This panel couldn't load.");
    for (let i = 0; i < 2; i += 1) {
      tile().querySelector('.mp-panel-tile__retry')?.click();
      await vi.advanceTimersByTimeAsync(0);
      pending.get('harbour').reject(new Error('boom'));
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(tile().className).toContain('mp-panel-tile--reload_addon');
  });

  it('a slow load past the timeout that then fails shows the error card', async () => {
    const { pending } = slowPanel();
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'harbour' })] });
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS + 10);
    pending.get('harbour').reject(new Error('boom'));
    await vi.advanceTimersByTimeAsync(0);
    expect(tile().className).toContain('mp-panel-tile--error');
    expect(tile().querySelector('[data-cy="mp-panel-slow-notice"]')).toBeNull();
  });

  it('host words replace the English marks', async () => {
    slowPanel();
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'harbour' })], labels: { slow: 'Prend plus de temps…' } });
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS + 10);
    expect(tile().querySelector('[data-cy="mp-panel-slow-notice"]').textContent).toBe('Prend plus de temps…');
  });

  it('a new SDK or chat pane alone does not load the tile again', async () => {
    const { def, pending } = slowPanel();
    let n = 0;
    const ctxFor = (mpId, d, e) => ({ panelId: d.id, config: e.instance.config, tommy: { n: (n += 1) }, chatPane: {} });
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'harbour' })], ctxFor });
    pending.get('harbour').resolve();
    await vi.advanceTimersByTimeAsync(0);
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'harbour' })], ctxFor });
    await vi.advanceTimersByTimeAsync(0);
    expect(def.load).toHaveBeenCalledTimes(1);
  });
});
