import type {
  ActionsApi, AttendanceSnapshot, ConfirmWriteOutcomeAnswer, DataStatus, HeldFirstAnswer, HostApi, HostCollection,
  QueuedWriteReceipt, ReadNotice, ReadState, WriteOutcome,
} from '../../src/types.js';

type Shift = { id: string; startsAt: string };
declare const shifts: HostCollection<Shift>;
declare const actions: ActionsApi;
declare const host: HostApi;

shifts.subscribe((rows) => {
  const whole: readonly Shift[] = rows;
  void whole;
}, {
  method: 'byRange',
  params: { from: '2026-11-24', to: '2026-11-30' },
  onRead: (notice) => {
    const state: 'checking' | 'fresh' | 'stale' | 'refused' = notice.state;
    const asOf: number | null = notice.asOf;
    const aged: boolean = notice.aged;
    const next: number | null | undefined = notice.nextAttemptAt;
    const reason: 'access' | 'unavailable' | undefined = notice.reason;
    // @ts-expect-error 'held' is a resolved state, never a notice
    const held: ReadNotice['state'] = 'held';
    void state; void asOf; void aged; void next; void reason; void held;
  },
});

const status: DataStatus = shifts.status();
const aged: boolean | undefined = status.aged;
void aged;

async function conditions() {
  const plain: { ready: boolean } = await actions.query<{ ready: boolean }>('mp.is_ready', {});
  const envelope: HeldFirstAnswer<{ ready: boolean }> = await actions.query<{ ready: boolean }>('mp.is_ready', {}, {
    onRead: (notice: ReadNotice<{ ready: boolean }>) => { const fresh: { ready: boolean } | undefined = notice.answer; void fresh; },
  });
  const state: 'held' | 'fresh' = envelope.state;
  // @ts-expect-error a refusal rejects; the envelope never says refused
  const refused: HeldFirstAnswer<unknown>['state'] = 'refused';
  const readState: ReadState = 'not_read';
  void plain; void state; void refused; void readState;
}

async function writes() {
  await actions.invoke('time-clock.record_attendance', { status: 'stop' }, { idempotencyKey: 'k-1' });
  const outcome: WriteOutcome | null = host.writeOutcome('record_attendance', 'k-1');
  if (outcome) {
    const state: 'succeeded' | 'refused' | 'unconfirmed' | 'queued' = outcome.state;
    const emitted: boolean = outcome.emitted;
    void state; void emitted;
  }
  const marked: boolean = await host.markOutcomeEmitted('record_attendance', 'k-1');
  const confirmed: ConfirmWriteOutcomeAnswer = await host.confirmWriteOutcome('record_attendance', 'k-1');
  if (confirmed.state === 'succeeded') { const replayed: boolean = confirmed.replayed; void replayed; }
  const receipts: readonly QueuedWriteReceipt[] = host.offlineQueue({ receipts: true }).receipts ?? [];
  const key: string | null = receipts[0].idempotencyKey;
  void marked; void key;
}

declare const snapshot: AttendanceSnapshot;
const why: 'not_fresh' | 'access_unknown' | null = snapshot.why;
const pendingKey: string = snapshot.pending[0].idempotencyKey;
void why; void pendingKey;
void conditions; void writes;
