/**
 * stale-world.test.js — a panel tile takes a stale-world refusal quietly.
 *
 * An account switch commits the new account while the old world's panels are
 * still mounted; their time display and host reads then refuse
 * (`TIMEZONE_CONTEXT_STALE`, `ACCOUNT_NOT_DISPLAYED`, the directory's
 * "belongs to another account" refusal). The tile shows no error card, emits
 * no `panel-error` and lets nothing reach the app's error handler; the panel
 * stays mounted and answers normally once its world is displayed again.
 * Any other error keeps the error card.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h, ref, nextTick } from 'vue';
import {
  createPanelHost, isStaleWorldRefusal, markStaleWorld, STALE_WORLD_CODES,
} from '../src/index.js';

const flush = async () => {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await nextTick();
  }
};

const timezoneStale = () => Object.assign(new RangeError('TIMEZONE_CONTEXT_STALE'), { code: 'TIMEZONE_CONTEXT_STALE' });
const accountNotDisplayed = () => Object.assign(new Error('This Mini Program belongs to an account that is not displayed now'), { code: 'ACCOUNT_NOT_DISPLAYED', name: 'TommyError' });
const otherAccount = () => markStaleWorld(Object.assign(new Error('Directory capability belongs to another account'), { code: 'PermissionDenied', name: 'TommyError' }));
const permissionDenied = () => Object.assign(new Error("Directory capability requires current 'read:team' authority"), { code: 'PermissionDenied', name: 'TommyError' });

const manifestPanels = { tile: { surfaces: ['dashboard'] }, sibling: { surfaces: ['dashboard'] } };

describe('isStaleWorldRefusal', () => {
  it('names the two stale-world codes and the marked refusal, nothing else', () => {
    expect([...STALE_WORLD_CODES]).toEqual(['ACCOUNT_NOT_DISPLAYED', 'TIMEZONE_CONTEXT_STALE']);
    expect(isStaleWorldRefusal(timezoneStale())).toBe(true);
    expect(isStaleWorldRefusal(accountNotDisplayed())).toBe(true);
    expect(isStaleWorldRefusal(otherAccount())).toBe(true);
    expect(isStaleWorldRefusal(permissionDenied())).toBe(false);
    expect(isStaleWorldRefusal({ code: 'TIMEZONE_INVALID' })).toBe(false);
    expect(isStaleWorldRefusal({ code: 'DATA_OFFLINE' })).toBe(false);
    expect(isStaleWorldRefusal({ staleWorld: 'yes' })).toBe(false);
    expect(isStaleWorldRefusal(new Error('This Mini Program belongs to an account that is not displayed now'))).toBe(false);
    expect(isStaleWorldRefusal('ACCOUNT_NOT_DISPLAYED')).toBe(false);
    expect(isStaleWorldRefusal(undefined)).toBe(false);
    expect(isStaleWorldRefusal(null)).toBe(false);
  });

  it('markStaleWorld returns the same error, marked', () => {
    const error = new Error('x');
    expect(markStaleWorld(error)).toBe(error);
    expect(error.staleWorld).toBe(true);
  });
});

describe('a panel tile whose world stops being displayed', () => {
  let host; let el; let events; let errorHandler; let shown; let renders;

  beforeEach(() => {
    events = [];
    errorHandler = vi.fn();
    shown = ref(true);
    renders = 0;
    host = createPanelHost({
      onEvent: (e) => events.push(e),
      // The app's error net hangs off the surface app's errorHandler.
      installComponentRuntime: (app) => { app.config.errorHandler = errorHandler; },
    });
    el = document.createElement('div');
    document.body.append(el);
  });
  afterEach(() => { host.unmountSurface(el); document.body.replaceChildren(); });

  const tile = () => el.querySelector('[data-panel-id="tile"]');
  const panelErrors = () => events.filter((e) => e.type === 'panel-error' || e.type === 'panel-reload-required');

  function mount(component) {
    const api = host.panelsApiFor('mp-x', manifestPanels, { firstParty: true });
    api.register({ id: 'tile', component });
    api.register({ id: 'sibling', component: { render: () => h('p', { class: 'sibling-body' }, 'sibling') } });
    host.mountSurface(el, { surface: 'dashboard', ctxFor: (_mp, def) => ({ panelId: def.id, tommy: {} }) });
  }

  // A panel whose render reads its world's display state, as the time display
  // does (it reads the store's account, token and user), and keeps local state.
  const renderingPanel = (refusal) => ({
    name: 'RenderingPanel',
    data: () => ({ picked: 0 }),
    render() {
      renders += 1;
      if (!shown.value) throw refusal();
      return h('div', { class: 'panel-body' }, [
        h('button', { class: 'pick', onClick: () => { this.picked += 1; } }, `picked ${this.picked}`),
      ]);
    },
  });

  it.each([
    ['TIMEZONE_CONTEXT_STALE', timezoneStale],
    ['ACCOUNT_NOT_DISPLAYED', accountNotDisplayed],
    ['the marked "another account" refusal', otherAccount],
  ])('a render refused with %s shows no error card and emits no panel-error', async (_name, refusal) => {
    mount(renderingPanel(refusal));
    await flush();
    expect(tile().className).toContain('mp-panel-tile--ready');
    expect(tile().querySelector('.panel-body')).toBeTruthy();

    shown.value = false;
    await flush();

    expect(tile().querySelector('.mp-panel-tile__error')).toBeNull();
    expect(tile().querySelector('.mp-panel-tile__reload')).toBeNull();
    expect(tile().className).toContain('mp-panel-tile--ready');
    expect(panelErrors()).toEqual([]);
    expect(errorHandler).not.toHaveBeenCalled();
    // The refused render left the panel empty; the sibling is untouched.
    expect(tile().querySelector('.panel-body')).toBeNull();
    expect(el.querySelector('.sibling-body')).toBeTruthy();
  });

  it('does not re-render the refused panel on its own (no throw loop)', async () => {
    mount(renderingPanel(timezoneStale));
    await flush();
    const before = renders;
    shown.value = false;
    await flush();
    await flush();
    // One re-render for the one change it reads, refused once, then quiet.
    expect(renders).toBe(before + 1);
  });

  it('recovers with its state when the same world is displayed again', async () => {
    mount(renderingPanel(timezoneStale));
    await flush();
    tile().querySelector('.pick').click();
    await flush();
    expect(tile().querySelector('.pick').textContent).toBe('picked 1');

    shown.value = false;
    await flush();
    expect(tile().querySelector('.panel-body')).toBeNull();

    shown.value = true;
    await flush();
    expect(tile().className).toContain('mp-panel-tile--ready');
    expect(tile().querySelector('.mp-panel-tile__error')).toBeNull();
    // The same instance, its state kept.
    expect(tile().querySelector('.pick').textContent).toBe('picked 1');
    expect(panelErrors()).toEqual([]);
    expect(errorHandler).not.toHaveBeenCalled();
  });

  it('a watcher refused while stale keeps the last frame and recovers', async () => {
    const seen = [];
    mount({
      name: 'WatchingPanel',
      computed: {
        axis() {
          if (!shown.value) throw timezoneStale();
          return 'Australia/Sydney';
        },
      },
      watch: { axis(value) { seen.push(value); } },
      render() { return h('div', { class: 'panel-body' }, 'rows'); },
    });
    await flush();
    shown.value = false;
    await flush();
    expect(tile().querySelector('.panel-body')).toBeTruthy();
    expect(tile().querySelector('.mp-panel-tile__error')).toBeNull();
    expect(panelErrors()).toEqual([]);
    expect(errorHandler).not.toHaveBeenCalled();

    shown.value = true;
    await flush();
    expect(tile().querySelector('.panel-body')).toBeTruthy();
    expect(panelErrors()).toEqual([]);
  });

  it('an async lifecycle refused while stale is quiet too', async () => {
    mount({
      name: 'LoadingPanel',
      async mounted() { throw accountNotDisplayed(); },
      render() { return h('div', { class: 'panel-body' }, 'rows'); },
    });
    await flush();
    expect(tile().querySelector('.mp-panel-tile__error')).toBeNull();
    expect(panelErrors()).toEqual([]);
    expect(errorHandler).not.toHaveBeenCalled();
  });

  it.each([
    ['an ordinary error', () => new Error('boom')],
    ['a PermissionDenied without the stale-world marker', permissionDenied],
    ['another time display refusal', () => Object.assign(new RangeError('TIMEZONE_INVALID'), { code: 'TIMEZONE_INVALID' })],
  ])('%s still shows the error card and emits panel-error', async (_name, error) => {
    mount({
      name: 'BrokenPanel',
      render() {
        if (!shown.value) throw error();
        return h('div', { class: 'panel-body' });
      },
    });
    await flush();
    shown.value = false;
    await flush();
    expect(tile().className).toContain('mp-panel-tile--error');
    expect(tile().querySelector('.mp-panel-tile__error')).toBeTruthy();
    expect(events.filter((e) => e.type === 'panel-error')).toHaveLength(1);
  });
});
