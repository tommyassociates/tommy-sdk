/**
 * @tommy/reference-mp — Team Check-in, the reference Mini Program
 * (05-deliverables/05-reference-mp; the M1 forcing function: built first,
 * the runtime refined against it).
 *
 * Exercises EVERY manifest primitive: one trigger (checkin_posted), one
 * condition (has_checked_in_today), one activity (record_checkin), a
 * required declared Action wiring them (record_on_checkin), the 2.22
 * teaching Actions (registered; extended-grammar dispatch is a recorded M1
 * deferral), panels on all three surfaces, one local store (checkins,
 * last_write_wins), and a bus subscription.
 *
 * CONTRACT-ONLY by construction: this module imports NOTHING — not
 * tommy-core, not the broker, not even @tommy/sdk. Everything arrives
 * through the injected `tommy` object (register(tommy)). The detectors run
 * over this source in CI to prove the isolation contract is real.
 *
 * Home: kept in the sdk Yarn-Berry workspace for M1 (round-1 decision; the
 * plan's own-repo `tommy-mp-reference` extraction is a recorded deviation,
 * deferred to the docs/public-SDK milestone).
 */
import manifestYaml from './manifest.js';

export const manifest = manifestYaml;

// The SDK instance, captured at register() — broker-side handlers below are
// registered from `handlers` before the SDK exists, so they close over this.
let sdk = null;

const todayKey = (iso) => String(iso).slice(0, 10);

async function allCheckins() {
  const store = sdk.data.store('checkins');
  return store.getAll();
}

/** Broker-side handlers for this MP's OWN declared primitives. */
export const handlers = {
  conditions: {
    /** has_checked_in_today — pure cross-MP read (cacheable 60s). */
    has_checked_in_today: async (args) => {
      const records = await allCheckins();
      const today = todayKey(new Date().toISOString());
      const checkedIn = records.some(
        (record) => record.teamMemberId === args.teamMemberId && todayKey(record.at) === today,
      );
      return { checkedIn };
    },
  },
  activities: {
    /** record_checkin — local_write, derived_from_input idempotency, offlineReplayable. */
    record_checkin: async (args) => {
      const store = sdk.data.store('checkins');
      const id = `chk-${args.teamMemberId}-${args.at}`;
      await store.put({ id, teamMemberId: args.teamMemberId, status: args.status, ...(args.note ? { note: args.note } : {}), at: args.at });
      return { checkinId: id };
    },
  },
};

function renderList(root, records, { title, showNotes = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'checkin-panel';
  const heading = document.createElement('h3');
  heading.textContent = `${title} (${records.length})`;
  wrap.append(heading);
  const list = document.createElement('ul');
  for (const record of records) {
    const li = document.createElement('li');
    li.dataset.status = record.status;
    li.textContent = `${record.teamMemberId}: ${record.status}${showNotes && record.note ? ` — ${record.note}` : ''}`;
    list.append(li);
  }
  wrap.append(list);
  root.replaceChildren(wrap);
}

export function register(tommy) {
  sdk = tommy;

  // Dashboard panel — today's team check-ins (rbac: admins/managers).
  tommy.panels.register({
    id: 'today-checkins',
    records: [],
    async load() {
      const today = todayKey(new Date().toISOString());
      this.records = (await allCheckins()).filter((r) => todayKey(r.at) === today);
    },
    render(root, ctx) {
      renderList(root, this.records, { title: tommy.t('checkin.today', "Today's check-ins"), showNotes: ctx.config?.showNotes !== false });
    },
  });

  // Team-member-details panel — that member's recent check-ins.
  tommy.panels.register({
    id: 'member-checkins',
    records: [],
    async load(ctx) {
      const memberId = ctx.surfaceContext?.teamMemberId;
      this.records = (await allCheckins()).filter((r) => r.teamMemberId === memberId).slice(-10);
    },
    render(root) {
      renderList(root, this.records, { title: tommy.t('checkin.recent', 'Recent check-ins') });
    },
  });

  // Full-page panel — history + the post form (posts through the BUS: the
  // emit fans out to the required record_on_checkin Action → record_checkin).
  tommy.panels.register({
    id: 'checkin-history',
    records: [],
    async load() {
      this.records = await allCheckins();
    },
    render(root) {
      renderList(root, this.records, { title: tommy.t('checkin.history', 'Check-in history') });
      const button = document.createElement('button');
      button.className = 'checkin-post';
      button.textContent = tommy.t('checkin.post', 'Check in: OK');
      button.addEventListener('click', () => {
        postCheckin(tommy, { status: 'ok' }).catch((e) => tommy.log('warn', 'check-in failed', e));
      });
      root.firstChild.append(button);
    },
  });

  // Bus subscription — exercises tommy.actions.subscribe (own trigger).
  tommy.actions.subscribe('team-checkin.checkin_posted', (payload) => {
    tommy.log('info', 'checkin_posted received', payload);
  });
}

/** Post a check-in for the current user through the Actions bus. */
export async function postCheckin(tommy, { status, note } = {}) {
  const payload = {
    teamMemberId: tommy.init.tenant.roles.includes('Team Member') ? 'self' : 'self',
    status: status || 'ok',
    ...(note ? { note } : {}),
    at: new Date().toISOString(),
  };
  return tommy.actions.emit('checkin_posted', payload);
}

export const locales = {
  en: {
    'checkin.today': "Today's check-ins",
    'checkin.recent': 'Recent check-ins',
    'checkin.history': 'Check-in history',
    'checkin.post': 'Check in: OK',
    'checkin.open_history': 'History',
  },
  de: {
    'checkin.today': 'Check-ins heute',
    'checkin.recent': 'Letzte Check-ins',
    'checkin.history': 'Check-in-Verlauf',
    'checkin.post': 'Einchecken: OK',
    'checkin.open_history': 'Verlauf',
  },
};

export default { manifest, handlers, register, locales };
