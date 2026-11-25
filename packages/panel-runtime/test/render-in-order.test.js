import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPanelHost, LOAD_TIMEOUT_MS } from '../src/index.js';

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

  const shown = () => {
    const root = el.querySelector('[data-panel-id="reports"] .mp-panel-tile__content').__mpShadowRoot;
    return [...root.querySelectorAll('p')].map((p) => p.textContent);
  };

  function panel(slow) {
    const waits = new Map();
    const def = {
      id: 'reports',
      load: vi.fn(async () => {}),
      render: vi.fn(async (root, ctx) => {
        const { location } = ctx.config;
        if (slow.has(location)) await new Promise((resolve) => { waits.set(location, resolve); });
        const p = document.createElement('p');
        p.textContent = `location ${location}`;
        root.append(p);
      }),
    };
    host.panelsApiFor('reports', panels).register(def);
    return { def, waits };
  }

  it('an older render that resumes late never writes over the newer render', async () => {
    const { waits } = panel(new Set(['harbour-slow']));
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'first' })] });
    await vi.advanceTimersByTimeAsync(0);
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'harbour-slow' })] });
    await vi.advanceTimersByTimeAsync(0);
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'pier' })] });
    await vi.advanceTimersByTimeAsync(0);
    waits.get('harbour-slow')?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown()).toEqual(['location pier']);
  });

  it('an older render that outlasts the load timeout still never writes over the newer render', async () => {
    const { waits } = panel(new Set(['harbour-slow']));
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'first' })] });
    await vi.advanceTimersByTimeAsync(0);
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'harbour-slow' })] });
    await vi.advanceTimersByTimeAsync(0);
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'pier' })] });
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS + 10);
    expect(shown()).toEqual(['location pier']);
    waits.get('harbour-slow')?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown()).toEqual(['location pier']);
  });

  it('the previous render stays shown while a slow render draws its replacement', async () => {
    const { waits } = panel(new Set(['pier']));
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'first' })] });
    await vi.advanceTimersByTimeAsync(0);
    host.mountSurface(el, { surface: 'dashboard', layout: [entry({ location: 'pier' })] });
    await vi.advanceTimersByTimeAsync(0);
    expect(shown()).toEqual(['location first']);
    waits.get('pier')?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown()).toEqual(['location pier']);
  });
});
