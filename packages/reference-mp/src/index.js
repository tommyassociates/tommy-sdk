import manifestYaml from './manifest.js';

export const manifest = manifestYaml;

let sdk = null;

const todayKey = (iso) => String(iso).slice(0, 10);

async function allCheckins() {
  const store = sdk.data.store('checkins');
  return store.getAll();
}

export const handlers = {
  conditions: {
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

  tommy.panels.register({
    id: 'today-checkins',
    records: [],
    async load() {
      const today = todayKey(new Date().toISOString());
      this.records = (await allCheckins()).filter((r) => todayKey(r.at) === today);
    },
    render(root, ctx) {
      renderList(root, this.records, { title: tommy.t('checkin.today', "Today's Check-ins"), showNotes: ctx.config?.showNotes !== false });
    },
  });

  tommy.panels.register({
    id: 'member-checkins',
    records: [],
    async load(ctx) {
      const memberId = ctx.surfaceContext?.teamMemberId;
      this.records = (await allCheckins()).filter((r) => r.teamMemberId === memberId).slice(-10);
    },
    render(root) {
      renderList(root, this.records, { title: tommy.t('checkin.recent', 'Recent Check-ins') });
    },
  });

  tommy.panels.register({
    id: 'checkin-history',
    records: [],
    async load() {
      this.records = await allCheckins();
    },
    render(root) {
      renderList(root, this.records, { title: tommy.t('checkin.history', 'Check-in History') });
      const button = document.createElement('button');
      button.className = 'checkin-post';
      button.textContent = tommy.t('checkin.post', 'Check in: OK');
      button.addEventListener('click', () => {
        postCheckin(tommy, { status: 'ok' }).catch((e) => tommy.log('warn', 'check-in failed', e));
      });
      root.firstChild.append(button);
    },
  });

  tommy.actions.subscribe('team-checkin.checkin_posted', (payload) => {
    tommy.log('info', 'checkin_posted received', payload);
  });
}

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
    'checkin.today': "Today's Check-ins",
    'checkin.recent': 'Recent Check-ins',
    'checkin.history': 'Check-in History',
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
