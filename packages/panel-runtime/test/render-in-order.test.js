import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPanelHost } from '../src/index.js';

const panels = { reports: { surfaces: ['dashboard'] } };
const entry = (config) => ({ instance: { id: 'i-1', mpId: 'reports', panelId: 'reports', config }, decl: panels.reports, cell: { x: 0, y: 0, w: 4, h: 3 } });

describe('async renders on an in-place update', () => {
  let el;
  let host;
  beforeEach(() => {
    vi.useFakeTimers();
    host = createPanelHost({});
    el = document.createElement('div');
    document.body.append(el);
  });
  afterEach(() => { vi.useRealTimers(); el.remove(); });

  it('an older render that resumes late never writes over the newer render', async () => {
    const waits = new Map();
    let shadow = null;
    const def = {
      id: 'reports',
      load: vi.fn(async () => {}),
      render: vi.fn(async (root, ctx) => {
        shadow = root;
        const { location } = ctx.config;
        if (location === 'harbour-slow') await new Promise((resolve) => { waits.set(location, resolve); });
        const p = document.createElement('p');
        p.textContent = `location ${location}`;
        root.append(p);
      }),
    };
    host.panelsApiFor('reports', panels).register(def);
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'first' })] });
    await vi.advanceTimersByTimeAsync(0);

    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'harbour-slow' })] });
    await vi.advanceTimersByTimeAsync(0);
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'pier' })] });
    await vi.advanceTimersByTimeAsync(0);
    waits.get('harbour-slow')?.();
    await vi.advanceTimersByTimeAsync(0);

    expect([...shadow.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['location pier']);
  });
});
