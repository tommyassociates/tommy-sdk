import { describe, it, expect, vi } from 'vitest';
import { createPanelHost } from '../src/index.js';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('panel error Close', () => {
  it.each([true, false])('error and reload states with callback=%s', async (withClose) => {
    const host = createPanelHost();
    const el = document.createElement('div');
    const onClose = vi.fn();
    host.panelsApiFor('test', { broken: { surfaces: ['full_page'] } }).register({
      id: 'broken',
      load: async () => { throw new Error('unreachable'); },
      render() {},
    });
    host.mountSurface(el, { surface: 'full_page', ...(withClose ? { onClose } : {}), closeLabel: 'Fermer' });
    try {
      await flush();
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        expect(el.querySelector(attempt < 3 ? '.mp-panel-tile__error' : '.mp-panel-tile__reload')).not.toBeNull();
        const close = el.querySelector('[data-cy="mp-panel-error-close"]');
        expect(Boolean(close)).toBe(withClose);
        if (close) {
          expect(close.textContent).toBe('Fermer');
          close.click();
          expect(onClose).toHaveBeenCalledTimes(attempt);
        }
        if (attempt < 3) {
          el.querySelector('.mp-panel-tile__retry').click();
          await flush();
        }
      }
    } finally { host.unmountSurface(el); }
  });
});
