export type MpId = string;
export type Surface =
  | 'dashboard'
  | 'team_member_details'
  | 'client_details'
  | 'full_page';
export type Iso8601 = string;

export type CapabilityToken = string & { readonly __brand: 'CapabilityToken' };

export type TommyErrorCode =
  | 'UnknownTrigger'
  | 'UnknownCondition'
  | 'UnknownActivity'
  | 'InvalidPayload'
  | 'PermissionDenied'
  | 'Timeout'
  | 'ConditionError'
  | 'ActivityFailed'
  | 'Offline_QueueFull'
  | 'WriteHeld'
  | 'WriteNotFound'
  | 'WriteNotConfirmable'
  | 'RateLimited'
  | 'CapabilityTokenInvalid'
  | 'LoopDetected'
  | 'ChainDepthExceeded'
  | 'FanoutLimitExceeded'
  | 'DevicePermissionDenied'
  | 'DeviceUnavailable'
  | 'Offline'
  | 'UnknownMethod';

export interface TommyError {
  readonly name: 'TommyError';
  readonly code: TommyErrorCode;
  readonly message: string;
  readonly rule?: string;
  readonly retryable: boolean;
  readonly runId?: string;
  readonly cause?: unknown;
  readonly retryAfterMs?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface EmitReceipt {
  readonly emitId: string;
  readonly deliveredTo: number;
  readonly queuedFor: number;
}

export type InvokeStatus = 'succeeded' | 'failed' | 'dead_letter' | 'queued_offline';

export interface InvokeResult<R = unknown> {
  readonly rpcId: string;
  readonly status: InvokeStatus;
  readonly result?: R;
  readonly error?: TommyError;
}

export type Handler<P = unknown> = (payload: P, meta: TriggerMeta) => void | Promise<void>;

export interface TriggerMeta {
  readonly emitId: string;
  readonly emitterMpId: MpId;
  readonly ts: Iso8601;
  readonly live: boolean;
}

export type Unsubscribe = () => void;

export type BatchCall =
  | { kind: 'emit'; trigger: string; payload: unknown }
  | { kind: 'query'; condition: string; args: unknown }
  | { kind: 'invoke'; activity: string; args: unknown };

export interface TransactionContext {
  readonly txnId: string;
  invoke<R = unknown>(activity: string, args: unknown): Promise<InvokeResult<R>>;
}

export type InputMapSource =
  | { from: 'trigger'; path: string; default?: unknown; transform?: TransformChain }
  | { from: 'condition'; ref: string; path: string; default?: unknown; transform?: TransformChain }
  | { from: 'serviceRead'; ref: string; path: string; default?: unknown; transform?: TransformChain }
  | { from: 'option'; path: string; default?: unknown; transform?: TransformChain }
  | { from: 'item'; path: string; default?: unknown; transform?: TransformChain }
  | { const: unknown; default?: unknown }
  | { template: string; default?: unknown };                                                          // Placeholders render as data, never HTML.

export type InputMap = Record<string, InputMapSource>;

// Closed operator set: extending this union is a platform release, never config.
export type TransformOp =
  | 'concat' | 'upper' | 'lower' | 'trim' | 'slice' | 'replace'
  | 'add' | 'subtract' | 'multiply' | 'divide' | 'round' | 'clamp'
  | 'format' | 'add_duration' | 'diff' | 'day_of_week' | 'bucket_time'
  | 'coalesce' | 'default' | 'exists' | 'not' | 'equals'
  | 'map'
  | 'first' | 'last' | 'count' | 'sum' | 'pluck' | 'join' | 'find' | 'filter';

export interface TransformStep { op: TransformOp; args?: Record<string, unknown> }
export type TransformChain = TransformStep[];

export type Predicate =
  | { source: InputMapSource; op: 'exists' | 'not_exists' | 'equals' | 'not_equals' | 'one_of' | 'range'; operand?: unknown; operands?: unknown[] }
  | { allOf: Predicate[] }
  | { anyOf: Predicate[] };

export type SelectBranch =
  | { when: Predicate; mp?: string; name: string; inputMap?: InputMap }
  | { else: true; mp?: string; name: string; inputMap?: InputMap }
  | { else: true; skip: true };

export interface ForEachDecl { from: InputMapSource; maxItems: number }

export interface ServiceReadDecl { ref: string; name: `tommy.${string}`; input?: InputMap }

export interface ConfirmGuard { title: string; message: string; confirmLabel?: string; destructive?: boolean }

// visibleWhen gates visibility, never authority.
export interface InteractionDeclaration {
  id: string;
  kind: 'button' | 'menu_item' | 'list_row_action' | 'fab' | 'link';
  surface: { route: string } | { panel: string };
  label: { key: string };
  icon?: string;
  payload: Record<string, { from: 'route'; param: string } | { from: 'context'; path: string } | { const: unknown }>;
  visibleWhen?: Predicate;
  hideWhenUnwired?: boolean;
}

export interface FunctionDeclaration {
  entry: `functions/${string}`;
  runtime: 'afr-js@1';
  description: string;
  inputSchema?: object;
  resultSchema: object;
  timeoutMs: number;
  memoryMb: number;
  reads: { conditions?: string[]; serviceReads?: `tommy.${string}`[] };
  targets: { activities: string[] };
  contractVersion?: string;
  deprecated?: { replacement?: string; removeAfter?: string };
}

export interface FunctionInput<TriggerPayload = unknown, Options = unknown> {
  trigger: TriggerPayload;
  conditions: Record<string, unknown>;
  serviceReads: Record<string, unknown>;
  options: Options;
  now: string;
  randomSeed: string;
}

// The function never invokes: it returns the intent and the server executor validates and dispatches.
export type ComputedActionResult =
  | { activity: { mp: string; name: string }; args: unknown; idempotencyKey?: string }
  | { activity: { mp: string; name: string }; args: unknown; idempotencyKey?: string }[]
  | { skip: true };

export interface SolutionSchema {
  id: string;
  version: number;
  audience: { teamType?: string; flags?: string[] } | { tenantId: string };
  mps: { mpId: string }[];
  actions: { actionId: string; enabled: boolean; options?: Record<string, unknown> }[];
  rules?: { key: string; op: 'compare' | 'range' | 'one_of' | 'required' | 'default'; operands: unknown[] }[];
  config?: Record<string, unknown>;
}

export interface ActionsApi {
  emit(trigger: string, payload: unknown): Promise<EmitReceipt>;

  query<R = unknown>(condition: string, args: unknown, options?: { signal?: AbortSignal }): Promise<R>;
  // A refusal rejects; it never resolves.
  query<R = unknown>(condition: string, args: unknown, options: { signal?: AbortSignal; onRead: (notice: ReadNotice<R>) => void }): Promise<HeldFirstAnswer<R>>;

  invoke<R = unknown>(activity: string, args: unknown, options?: { idempotencyKey?: string }): Promise<InvokeResult<R>>;

  subscribe<P = unknown>(trigger: string, handler: Handler<P>): Unsubscribe;

  batch(calls: readonly BatchCall[]): Promise<ReadonlyArray<PromiseSettledResult<unknown>>>;

  transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
}

export interface TenantContext {
  readonly tenantId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
}

export interface SurfaceContext {
  readonly surface: Surface;
  readonly teamMemberId?: string;
  readonly clientId?: string;
}

export interface MpInit {
  readonly instanceId: string;
  readonly tenant: TenantContext;
  readonly locale: string;
  readonly theme: ThemeContext;
  readonly capabilityToken: CapabilityToken;
  readonly grantedScopes: readonly string[];
  readonly surfaceContext: SurfaceContext;
  readonly mpConfig: Readonly<Record<string, unknown>>;
  readonly sharedDeps: Readonly<Record<string, string>>;
  readonly hostApi?: number;
}

export type ThemeMode = 'light' | 'dark';

export type ThemeTokens = Readonly<Record<`--tommy-${string}`, string>>;

export interface ThemeContext {
  readonly mode: ThemeMode;
  readonly colorScheme: ThemeMode;
  readonly tokens: ThemeTokens;
}

export interface ThemeApi {
  readonly current: ThemeContext;
  onChange(handler: (theme: ThemeContext) => void): Unsubscribe;
}

export type PanelStatus =
  | 'discovered'
  | 'loading'
  | 'ready'
  | 'stale'
  | 'needs_connection'
  | 'error';

export interface PanelCell {
  readonly panelId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ComposedPanelInstance {
  readonly id: string;
  readonly mpId: MpId;
  readonly panelId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly params?: Readonly<Record<string,
    | { readonly source: 'context' }
    | { readonly source: 'static'; readonly value: unknown }
    | { readonly source: 'default' }>>;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly visibility?: {
    readonly audience?: {
      readonly roles?: readonly string[];
      readonly members?: readonly string[];
      readonly tags?: readonly string[];
      readonly locations?: readonly string[];
      readonly skills?: readonly string[];
    };
  };
}

export interface PanelParamSpec {
  readonly name: string;
  readonly type: 'string' | 'integer' | 'boolean' | 'id';
  readonly required?: boolean;
  readonly source?: 'context' | 'static' | 'any';
  readonly label?: string;
  readonly description?: string;
}

// decl is null when the panel is gone; the entry is kept so a stored composition never loses a placement.
export interface ResolvedPanelEntry {
  readonly instance: ComposedPanelInstance;
  readonly decl: (Readonly<Record<string, unknown>> & { readonly params?: readonly PanelParamSpec[] }) | null;
  readonly cell: PanelCell;
}

export interface PanelContext {
  readonly panelId: string;
  readonly surface: Surface;
  readonly surfaceContext: SurfaceContext;
  readonly config: Readonly<Record<string, unknown>>;
  readonly online: boolean;
}

export interface PanelDefinition {
  readonly id: string;
  load(ctx: PanelContext): Promise<void>;
  render(root: ShadowRoot, ctx: PanelContext): void | Promise<void>;
  refresh?(ctx: PanelContext): void | Promise<void>;
  unmount?(): void;
}

export interface PanelsApi {
  register(def: PanelDefinition): void;
  requestNavigation(target: { route: string; params?: Record<string, string> }): Promise<void>;
  reportSize(panelId: string, size: { w: number; h: number }): void;
}

export interface Query<Rec = unknown> {
  get(key: IDBValidKey): Rec | undefined;
  getAll(query?: { index?: string; range?: IDBKeyRange }): readonly Rec[];
}
export type Selector<Rec, V> = (q: Query<Rec>) => V;

export interface DataStore<Rec = unknown> {
  get(key: IDBValidKey): Promise<Rec | undefined>;
  getRaw(key: IDBValidKey): Promise<Rec | undefined>;
  getAll(query?: { index?: string; range?: IDBKeyRange }): Promise<Rec[]>;
  getAllRaw(): Promise<Rec[]>;
  scan?(options: { cursor: string | null; limit: number }): Promise<{ rows: Rec[]; nextCursor: string | null; complete: boolean }>;
  scanRaw?(options: { cursor: string | null; limit: number }): Promise<{ rows: Rec[]; nextCursor: string | null; complete: boolean }>;
  put(record: Rec): Promise<IDBValidKey>;
  delete(key: IDBValidKey, options?: { expectedRevision?: number }): Promise<void>;
  subscribe(handler: (records: Rec[]) => void): Unsubscribe;
  subscribeQuery<V>(selector: Selector<Rec, V>, handler: (value: V) => void): Unsubscribe;
}

export interface HostCollection<Rec = unknown> {
  read(key?: string | readonly string[] | null): Promise<readonly Rec[] | Rec | readonly (Rec | null)[] | null>;
  getMany(keys: readonly string[]): Promise<readonly (Rec | null)[]>;
  query(spec?: { index?: string; equals?: readonly string[]; anyOf?: readonly string[]; limit?: number; cursor?: string | null }):
    Promise<{ rows: readonly Rec[]; nextCursor: string | null; complete: boolean }>;
  subscribe(callback: (rows: readonly (Rec | null)[]) => void, options: { keys: readonly string[]; onError?: (error: unknown) => void }): () => void;
  subscribe(callback: (rows: readonly Rec[]) => void, options: {
    method: string;
    params: Record<string, unknown>;
    onRead?: (notice: ReadNotice) => void;
    onError?: (error: unknown) => void;
  }): () => void;
  subscribe(callback: (rows: readonly Rec[]) => void, options?: { onError?: (error: unknown) => void }): () => void;
  status(): DataStatus & { complete: boolean };
  refresh(options?: {
    method?: string;
    params?: Readonly<Record<string, unknown>>;
    maxAge?: number;
    fresh?: boolean;
    waitMs?: number;
    retry?: boolean;
  }): Promise<DataStatus & { waited?: true; keys?: readonly string[] | null; more?: boolean | null }>;
}

export interface DataApi {
  store<Rec = unknown>(name: string): DataStore<Rec>;
  host?<Rec = unknown>(collection: string, options?: { profile?: string }): HostCollection<Rec>;
  syncState(storeName: string): {
    lastSyncedAt: Iso8601 | null;
    pending: number;
    online: boolean;
    breaker?: 'closed' | 'open' | 'half_open';
    stale?: boolean;
  };
  read?<Rec = unknown>(collection: string, key?: string | readonly string[] | null, options?: { raw?: boolean }): Promise<Rec | Rec[] | null>;
  query?<Rec = unknown>(collection: string, spec?: DataQuerySpec<Rec>): Promise<{ rows: Rec[]; nextCursor: string | null; complete: boolean }>;
  subscribe?<Value = unknown>(target: DataTarget, callback: (value: Value) => void, options?: { onError?: (error: unknown) => void }): () => void;
  source?<Dto = unknown, Rec = unknown>(collection: string, spec: DataSource<Dto, Rec>): () => void;
  refresh?(target: DataTarget, options?: DataRefreshOptions): Promise<DataStatus>;
  mutate?<Rec = unknown>(collection: string, command: DataMutation<Rec>, options?: { wait?: boolean }): Promise<{ key: string; pushed: boolean }>;
  ingest?<Rec = unknown>(collection: string, rows: readonly Rec[], options?: { replace?: boolean; complete?: boolean; scope?: (row: Rec) => boolean }): Promise<{ written: number; unsaved?: string[] }>;
  purge?(collection: string, options?: { force?: boolean; keys?: readonly string[]; query?: DataIndexRange }): Promise<{ removed: string[] }>;
  trim?(collection: string, options: DataIndexRange & { keep: number }): Promise<{ removed: string[] }>;
  status?(target: DataTarget): DataStatus;
  retryFailed?(): Promise<unknown>;
}

export type DataTarget = string | { collection: string; key?: string; window?: Record<string, unknown>; query?: DataQuerySpec };
export interface DataIndexRange {
  readonly index: string;
  readonly equals?: readonly unknown[];
  readonly prefix?: readonly unknown[];
  readonly lower?: unknown;
  readonly upper?: unknown;
}
export interface DataQuerySpec<Rec = unknown> {
  readonly index?: string;
  readonly equals?: readonly unknown[];
  readonly prefix?: readonly unknown[];
  readonly lower?: unknown;
  readonly upper?: unknown;
  readonly limit?: number;
  readonly cursor?: string | null;
  readonly where?: (row: Rec) => boolean;
  readonly raw?: boolean;
}
export interface DataSource<Dto = unknown, Rec = unknown> {
  fetch(target: { collection: string; key?: string; window?: Record<string, unknown> }, context?: { since?: string | null; principal?: unknown; background?: boolean }): Promise<Dto[] | Dto | { rows: Dto[]; cursor?: string | null; since?: boolean } | null>;
  read?: { cursor?: boolean; removedField?: string; fullEveryMs?: number; forbidden?: 'purge' | 'keep' };
  budgetKey?: string;
  toRecord?(dto: Dto, prev?: Rec): Rec;
  keyOf?(dto: Dto): string;
  scope?(target: { collection: string; window?: Record<string, unknown> }): (row: Rec) => boolean;
  // A change may arrive again after a failure or reload, so a push must be idempotent.
  push?(command: DataMutation<Rec>, record: Rec | null): Promise<unknown>;
}
export interface DataRefreshOptions {
  readonly mode?: 'silent' | 'visible';
  readonly priority?: 'visible' | 'high' | 'normal' | 'background';
  readonly maxAge?: number;
  readonly reason?: string;
  readonly full?: boolean;
}
export interface HostOwnedDataRefreshOptions extends DataRefreshOptions {
  readonly nextAttempt?: boolean;
}
export type DataMutation<Rec = unknown> =
  | { op: 'put'; record: Rec }
  | { op: 'patch'; key: string; patch: Partial<Rec> }
  | { op: 'delete'; key: string };
export interface DataStatus {
  readonly state: 'fresh' | 'stale' | 'refreshing' | 'offline' | 'error';
  readonly syncedAt: number | null;
  readonly error: { code: string | null; status: number | null; message: string } | null;
  readonly aged?: boolean;
}

export type ReadState =
  | 'held'
  | 'checking'
  | 'fresh'
  | 'stale'
  | 'refused'
  | 'not_read';

export interface ReadError { code: string | null; status: number | null; message: string }

export interface ReadNotice<T = unknown> {
  state: 'checking' | 'fresh' | 'stale' | 'refused';
  answered: boolean;
  asOf: number | null;
  aged: boolean;
  retrying?: boolean;
  nextAttemptAt?: number | null;
  error?: ReadError | null;
  reason?: 'access' | 'unavailable';
  answer?: T;
  permissions?: 'confirmed' | 'last_known';
}

export interface HeldFirstAnswer<T> {
  answer: T;
  // Never 'refused': a refusal rejects the promise or arrives as the terminal notice.
  state: 'held' | 'fresh';
  asOf: number | null;
  aged: boolean;
}

export type WriteOutcomeState = 'succeeded' | 'refused' | 'unconfirmed' | 'queued';

export interface WriteOutcome {
  state: WriteOutcomeState;
  at: number;
  rpcId: string | null;
  refusal?: ReadError;
  emitted: boolean;
  confirmable: boolean;
}

export type ConfirmWriteOutcomeAnswer =
  | { state: 'succeeded'; result: unknown; replayed: boolean; rpcId: string }
  | { state: 'refused'; refusal: ReadError }
  | { state: 'unconfirmed'; error: ReadError };

export interface QueuedWriteReceipt {
  readonly id: string;
  readonly activity: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly queuedAt: number;
  readonly attempts: number;
  readonly state: 'queued' | 'sending' | 'failed' | 'refused';
  readonly idempotencyKey: string | null;
  readonly refusal?: { code: string | null; message: string; status: number | null };
  readonly refusedAt?: number;
}

export interface OfflineQueueAnswer {
  readonly total: number;
  readonly bytesUsed: number;
  readonly bytesCap: number | null;
  readonly entriesCap: number | null;
  readonly expiredOnLoad: number;
  readonly receipts?: readonly QueuedWriteReceipt[];
}

export interface PendingAttendance {
  idempotencyKey: string;
  status: 'start' | 'stop' | 'pause' | 'resume';
  at: string;
  teamMemberId: string;
}

export interface AttendanceSnapshot<A = Readonly<Record<string, unknown>>> {
  attendances: A[];
  unresolved: boolean;
  why: 'not_fresh' | 'access_unknown' | null;
  held: boolean;
  asOf: number | null;
  pending: PendingAttendance[];
}

export type DirectoryKind =
  | 'team_member' | 'location' | 'role' | 'skill' | 'tag' | 'client';

// Never a full record.
export interface EntityRef {
  readonly kind: DirectoryKind;
  readonly id: string;
  readonly displayName: string;
  readonly userId?: string;
  readonly tagId?: string;
}

export interface PickerResult extends Array<EntityRef> {
  readonly cancelled?: boolean;
}

export interface PickerOptions {
  readonly purpose?:
    | 'booking_assignee'
    | 'task_create_assignee'
    | 'task_update_assignee'
    | 'journey_assignee';
  readonly preselected?: readonly string[];
  readonly preselectedUserIds?: readonly string[];
  readonly preselectedTagIds?: readonly string[];
  readonly title?: string;
}

export interface PickOptions extends PickerOptions {
  readonly kinds: readonly DirectoryKind[];
  readonly multiple?: boolean;
}

// Never load directory.list() to fill a select: a 10,000-member team stalls the page.
export interface UiApi {
  setTopEdge(options: { color: string; content?: 'auto' | 'light' | 'dark' }): Promise<void>;
  resetTopEdge(): Promise<void>;
  // Files and URLs never leave the host.
  captureChatAttachment(opts: { el: HTMLElement; kind: 'files' | 'photo' | 'audio' }): Promise<{
    id: string; state: string; count: number; requiresReattachment: boolean;
    files: readonly { filename: string; contentType: string; byteSize: number }[];
  } | null>;
  showChatMessageBlocks(opts: {
    conversationId: string; messageId: string; accessEpisode: string | null; contextVersion: string; el: HTMLElement;
  }): Promise<{ close(): void }>;
  showChatMessageMedia(opts: {
    conversationId: string; messageId: string; accessEpisode: string | null; contextVersion: string; el: HTMLElement;
  }): Promise<{ close(): void }>;
  // The confirmation is single-use and payload-bound; no billing data crosses this boundary.
  confirmTeamMemberUpdate(opts: {
    memberId: string;
    data: Record<string, unknown>;
    el: HTMLElement;
  }): Promise<{ approved: boolean; restoreConfirmation?: string }>;
  pick(opts: PickOptions): Promise<PickerResult>;
  pickTeamMember(opts?: PickerOptions): Promise<EntityRef | null>;
  pickTeamMembers(opts?: PickerOptions): Promise<PickerResult>;
  pickLocation(opts?: PickerOptions): Promise<EntityRef | null>;
  pickLocations(opts?: PickerOptions): Promise<PickerResult>;
  pickRole(opts?: PickerOptions): Promise<EntityRef | null>;
  pickSkill(opts?: PickerOptions): Promise<EntityRef | null>;
  pickSkills(opts?: PickerOptions): Promise<PickerResult>;
  pickTag(opts?: PickerOptions): Promise<EntityRef | null>;
  pickTags(opts?: PickerOptions): Promise<PickerResult>;
  showMiniProfile(ref: { kind: 'team_member' | 'client'; id: string }): Promise<void>;
  // Grant-free: it exposes no data, so it needs no catalogue scope.
  toast(opts: {
    message: string;
    variant?: 'info' | 'success' | 'warning' | 'error';
    durationMs?: number;
    action?: { label: string };
  }): Promise<{ actionInvoked: boolean }>;
  confirm(opts: {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }): Promise<boolean>;
}

export interface DirectoryApi {
  resolve(kind: DirectoryKind, id: string): Promise<EntityRef | null>;
  resolveMany(kind: DirectoryKind, ids: readonly string[], opts?: { idSpace?: 'id' | 'user' | 'tag' }): Promise<ReadonlyArray<EntityRef>>;
  list(
    kind: DirectoryKind,
    query?: { search?: string; limit?: number; cursor?: string },
  ): Promise<{ items: readonly EntityRef[]; nextCursor?: string }>;
}

export interface PhotoResult {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}
export interface AudioResult {
  readonly blob: Blob;
  readonly durationMs: number;
}
export interface ScanResult {
  readonly value: string;
  readonly format: string;
}
export interface Position {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy: number;
  readonly timestamp: number;
}
export interface NetworkStatus {
  readonly online: boolean;
  readonly type: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';
}
export interface DeviceInfo {
  readonly platform: 'ios' | 'android' | 'web';
  readonly osVersion: string;
  readonly model: string;
}

export interface DeviceApi {
  capturePhoto(opts?: { camera?: 'front' | 'back' }): Promise<PhotoResult>;
  scanCode(opts?: { formats?: readonly string[] }): Promise<ScanResult>;
  recordAudio(opts?: { maxMs?: number }): Promise<AudioResult>;
  getLocation(opts?: { highAccuracy?: boolean }): Promise<Position>;
  watchLocation(handler: (p: Position) => void, opts?: { highAccuracy?: boolean }): Unsubscribe;
  network(): Promise<NetworkStatus>;
  onNetworkChange(handler: (s: NetworkStatus) => void): Unsubscribe;
  share(payload: { title?: string; text?: string; url?: string }): Promise<void>;
  saveImage(image: Blob): Promise<void>;
  notify(opts: { title: string; body: string }): Promise<void>;
  info(): Promise<DeviceInfo>;
  requestKioskMode(opts: { enabled: boolean }): Promise<void>;
}

export interface ForecastingGate {
  readonly experimental: boolean;
  readonly plusOrPro: boolean;
  readonly salesForecastingEnabled: boolean;
  readonly demandPlanningEnabled: boolean;
}

export interface ForecastingSettings {
  readonly businessDayCutoff: string;
  readonly businessDayCutoffOverrides: Readonly<Record<string, string>>;
  readonly forecastWeeksWindow: number;
  readonly minGeneratedShiftHours: number;
}

export interface ForecastingErrorResult {
  readonly error: 'upgrade_required' | 'billing_locked' | 'hidden' | 'forbidden'
    | 'unauthenticated' | 'not_found' | 'conflict' | 'validation' | 'rate_limited'
    | 'offline' | 'failed';
  readonly status: number;
  readonly code: string | null;
  readonly message: string | null;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type ForecastingResult<T> = T | ForecastingErrorResult;

export interface SalesMetricsWeekPage {
  readonly location_id: number;
  readonly iso_week: string;
  readonly complete: boolean;
  readonly content_hash: string;
  readonly buckets: ReadonlyArray<readonly [timestamp: number, revenue: number | null, txCount: number | null]>;
}

export interface SalesMetricsManifest {
  readonly location_id: number;
  readonly weeks: Readonly<Record<string, string>>;
}

export interface DemandRuleTiming {
  readonly time_window?: { readonly start: string; readonly end: string } | null;
  readonly min_shift_hours?: number | null;
}

export interface SalesBandRuleParams extends DemandRuleTiming {
  readonly metric: 'revenue' | 'tx_count';
  readonly per_value: number;
  readonly min: number;
  readonly max: number;
}

export type CalendarRuleParams = DemandRuleTiming & { readonly headcount: number } & (
  | { readonly trigger: 'day_of_week' | 'day_of_month'; readonly value: ReadonlyArray<number> }
  | { readonly trigger: 'day_of_year' | 'public_holiday'; readonly value: ReadonlyArray<string> }
);

export type DemandRule = {
  readonly id: number;
  readonly location_id: number | null;
  readonly role_tag_id: number;
  readonly role_name: string | null;
  readonly active: boolean;
  readonly position: number;
} & (
  | { readonly kind: 'sales_band'; readonly params: SalesBandRuleParams }
  | { readonly kind: 'calendar'; readonly params: CalendarRuleParams }
);

export interface DemandModel {
  readonly id: number;
  readonly name: string;
  readonly status: 'draft' | 'active' | 'archived';
  readonly config_version: string;
  readonly created_by_id: number | null;
  readonly created_at: Iso8601;
  readonly updated_at: Iso8601;
  readonly rules: ReadonlyArray<DemandRule>;
}

export type DemandModelsRead =
  | { readonly notModified: true; readonly etag: string | null }
  | {
    readonly notModified: false;
    readonly etag: string | null;
    readonly demand_models: ReadonlyArray<DemandModel>;
    readonly bands_omitted: boolean;
  };

export interface SalesEstimate {
  readonly id: number;
  readonly location_id: number;
  readonly business_date: string;
  readonly hour: number | null;
  readonly value: number;
  readonly tx_count: number | null;
  readonly note: string | null;
  readonly created_by_id: number | null;
  readonly updated_at: Iso8601;
}

export interface ForecastingRuleWrite {
  kind?: 'sales_band' | 'calendar';
  locationId?: string | number | null;
  roleId?: string | number;
  active?: boolean;
  position?: number;
  params?: SalesBandRuleParams | CalendarRuleParams;
}

export interface ForecastingHostApi {
  settings(): Promise<ForecastingSettings>;
  weeks(args: { locationId: string | number; isoWeeks: string | ReadonlyArray<string>; kinds?: string | ReadonlyArray<'total' | 'count'> }): Promise<ForecastingResult<{ readonly pages: ReadonlyArray<SalesMetricsWeekPage> }>>;
  manifest(args: { locationId: string | number; from: string; to: string }): Promise<ForecastingResult<SalesMetricsManifest>>;
  demandModels(args?: { etag?: string }): Promise<ForecastingResult<DemandModelsRead>>;
  createDemandModel(args: { name: string }): Promise<ForecastingResult<DemandModel>>;
  updateDemandModel(args: { id: string | number; name?: string; status?: DemandModel['status'] }): Promise<ForecastingResult<DemandModel>>;
  deleteDemandModel(args: { id: string | number }): Promise<ForecastingResult<{ readonly deleted: true }>>;
  createRule(args: ForecastingRuleWrite & { modelId: string | number; kind: 'sales_band' | 'calendar'; roleId: string | number; params: SalesBandRuleParams | CalendarRuleParams }): Promise<ForecastingResult<DemandRule>>;
  updateRule(args: ForecastingRuleWrite & { modelId: string | number; ruleId: string | number }): Promise<ForecastingResult<DemandRule>>;
  deleteRule(args: { modelId: string | number; ruleId: string | number }): Promise<ForecastingResult<{ readonly deleted: true }>>;
  estimates(args: { locationId: string | number; from: string; to: string; since?: Iso8601 }): Promise<ForecastingResult<{ readonly sales_estimates: ReadonlyArray<SalesEstimate> }>>;
  upsertEstimate(args: { locationId: string | number; businessDate: string; hour?: number | null; value: number; txCount?: number | null; note?: string | null }): Promise<ForecastingResult<SalesEstimate>>;
  deleteEstimate(args: { locationId: string | number; businessDate: string; hour?: number | null }): Promise<ForecastingResult<{ readonly deleted: true }>>;
}

export interface HostHoliday {
  readonly id: string;
  readonly date: Iso8601;
  readonly name: string;
  readonly regions: ReadonlyArray<string>;
}

export interface HostTimesheetQuery {
  readonly timesheetId?: string;
  readonly shiftId?: string;
  readonly shiftIds?: ReadonlyArray<string>;
  readonly startAt?: Iso8601;
  readonly endAt?: Iso8601;
  readonly teamMemberId?: string;
  readonly status?: string;
  readonly kind?: string;
  readonly locationId?: string;
  readonly dashboard?: true;
}

export interface HostTimesheet {
  readonly id: string;
  readonly teamMemberId: string;
  readonly status: string;
  readonly shiftId?: string;
  readonly startAt?: Iso8601;
  readonly endAt?: Iso8601;
  readonly kind?: string;
  readonly totalHours?: number;
  readonly payTemplateId?: string;
  readonly locationId?: string;
  readonly leaveRequestId?: string;
  readonly notes?: string;
  readonly exportRefs?: Readonly<Record<string, unknown>>;
  readonly calculations?: Readonly<Record<string, unknown>>;
  readonly items: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly breaks: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly allowances: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly expenses: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

export interface HostTaskBoardFilters {
  readonly from?: Iso8601;
  readonly to?: Iso8601;
  readonly view_id?: string | number;
  readonly assignee_id?: string | number;
  readonly location_id?: string | number;
  readonly status?: 'to_do' | 'in_progress' | 'done' | 'overdue' |
    ReadonlyArray<'to_do' | 'in_progress' | 'done' | 'overdue'>;
}
export interface HostTaskCard {
  readonly id: string;
  readonly name: string;
  readonly origin: 'standalone' | 'shift';
  readonly status: 'to_do' | 'in_progress' | 'done';
  readonly version: number;
  readonly completable_via: 'api' | 'shift_route';
  readonly [field: string]: unknown;
}
export interface HostTaskSavedView {
  readonly id: string;
  readonly name: string;
  readonly definition: Readonly<Record<string, unknown>>;
  readonly version: number;
  readonly [field: string]: unknown;
}
export interface HostTaskQueryOptions {
  readonly windowKey?: string;
  readonly params?: HostTaskBoardFilters;
  readonly isCurrent?: () => boolean;
}
export interface HostTaskBoardSnapshot {
  readonly cards: ReadonlyArray<HostTaskCard>;
  readonly complete: boolean;
}
export interface HostTaskViewsSnapshot {
  readonly views: ReadonlyArray<HostTaskSavedView>;
  readonly complete: boolean;
}
export interface HostTaskQueryFailure {
  readonly stale?: boolean;
  readonly error?: string;
  readonly code?: string;
  readonly status?: number;
}
export interface HostFormEntryProof {
  readonly epoch: number; readonly grants: number; readonly receipt: number;
  readonly revision: number; readonly keys: readonly string[];
  readonly rowRevision: number | null; readonly origin: string | null;
}
export interface HostFormEntry {
  readonly id: string; readonly name: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly user_id: string | number | null; readonly team_id: string | number;
  readonly [field: string]: unknown;
}
export interface HostFormSubmissionReadRow {
  readonly id: string;
  readonly name: string;
  readonly team_id: string;
  readonly user_id?: string | null;
  readonly created_at: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly [field: string]: unknown;
}
export interface HostFormSubmissionWindowRestoration {
  readonly window: string;
  readonly requestedThrough: number;
  readonly page: number;
  readonly limit: number;
  readonly more: boolean | null;
  readonly moreKnown: boolean;
  readonly count: number | null;
  readonly pages: number | null;
  readonly atomic: false;
  readonly queryComplete: false;
}
export interface HeldWrite {
  readonly id: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly reason: string;
  readonly heldAt: number;
}
export interface HostApi {
  onQueuedWritesChange(callback: () => void): () => void;
  offlineQueue(options?: { receipts?: boolean }): OfflineQueueAnswer;
  writeOutcome(activity: string, idempotencyKey: string): WriteOutcome | null;
  markOutcomeEmitted(activity: string, idempotencyKey: string): Promise<boolean>;
  confirmWriteOutcome(activity: string, idempotencyKey: string): Promise<ConfirmWriteOutcomeAnswer>;
  heldWrite(activity: string, keyFields: Readonly<Record<string, string | number>>): HeldWrite | null;
  onHeldWriteChange(activity: string, keyFields: Readonly<Record<string, string | number>>, callback: (held: HeldWrite | null) => void): () => void;
  checkHeldWrite(id: string): Promise<unknown>;
  restoreFormSubmissionWindow(options: {
    readonly window: string;
    readonly throughPage?: number;
    readonly onRead?: (rows: ReadonlyArray<HostFormSubmissionReadRow>) => undefined;
  }): Promise<HostFormSubmissionWindowRestoration>;
  fetchFormSubmission(options: { readonly formId: string | number; readonly withReceipt: true }): Promise<{
    readonly record: HostFormEntry | null; readonly proof: HostFormEntryProof;
  }>;
  fetchFormSubmission(options: { readonly formId: string | number; readonly withReceipt?: false }): Promise<HostFormEntry | null>;
  formSubmissionCurrent(options: { readonly formId: string | number; readonly proof: HostFormEntryProof }): boolean;
  fetchDocumentsCatalogue(options?: {
    readonly allTeam?: boolean; readonly targetUserId?: string; readonly force?: boolean;
  }): Promise<{
    readonly documents: ReadonlyArray<Record<string, unknown>>;
    readonly documentTypes: ReadonlyArray<Record<string, unknown>>; readonly proof: unknown;
  }>;
  fetchDocumentTypesCatalogue(options?: {
    readonly force?: boolean; readonly manager?: boolean;
  }): Promise<{ readonly documentTypes: ReadonlyArray<Record<string, unknown>>; readonly proof: unknown }>;
  followDocumentsCatalogue(options?: {
    readonly allTeam?: boolean; readonly targetUserId?: string;
    readonly onChange?: () => void; readonly onError?: (error: unknown) => void;
  }): Promise<() => void>;
  followDocumentTypesCatalogue(options?: {
    readonly manager?: boolean; readonly onChange?: () => void;
    readonly onError?: (error: unknown) => void;
  }): Promise<() => void>;
  tasksBoardQuery(options?: HostTaskQueryOptions & {
    readonly incremental?: boolean;
    readonly onPage?: (cards: ReadonlyArray<HostTaskCard>) => void;
  }): Promise<HostTaskBoardSnapshot & HostTaskQueryFailure & { readonly serverTime?: string }>;
  tasksBoardSnapshot(options?: HostTaskQueryOptions): Promise<HostTaskBoardSnapshot>;
  tasksViews(options?: { readonly isCurrent?: () => boolean }): Promise<HostTaskViewsSnapshot & HostTaskQueryFailure>;
  tasksViewsSnapshot(options?: { readonly isCurrent?: () => boolean }): Promise<HostTaskViewsSnapshot>;
  tasksInvalidateBoardQuery(options?: { readonly windowKey?: string }): boolean;
  followTasksBoard(options: HostTaskQueryOptions & {
    readonly onChange?: (snapshot: HostTaskBoardSnapshot) => void;
    readonly onError?: (error: unknown) => void;
  }): () => void;
  followTasksViews(options: {
    readonly isCurrent?: () => boolean;
    readonly onChange?: (snapshot: HostTaskViewsSnapshot) => void;
    readonly onError?: (error: unknown) => void;
  }): () => void;

  journeysTemplatePreview?(params: {product_key: string}): Promise<Record<string, unknown>>;
  journeysDeleteFamily?(params: {id: string; base_version: number}): Promise<Record<string, unknown>>;
  journeysMemberSummaries?(params: {member_ids: ReadonlyArray<string | number>}): Promise<{
    members: ReadonlyArray<{metric: 'member_next'; member_id: string | number; open_step_count: number; next: ReadonlyArray<Record<string, unknown>>; stuck: boolean; server_time: string}>;
    server_time: string;
  }>;
  mountJourneyMemberPanel?(element: HTMLElement, options: {memberId: string | number}): Promise<{close(): void} | null>;

  feature(name: string): Promise<boolean>;
  permission(name: string): Promise<boolean>;
  holidays(range: { startAt: Iso8601; endAt: Iso8601; force?: boolean }): Promise<ReadonlyArray<HostHoliday>>;
  forecastingGate(): Promise<ForecastingGate>;
  readonly forecasting: ForecastingHostApi;
  payTemplates(query?: { teamMemberId?: string; force?: boolean }): Promise<ReadonlyArray<unknown>>;
  readSchedulingPayContexts(query: { userIds: readonly string[]; force?: boolean }): Promise<
    ReadonlyArray<Readonly<{ userId: string; employeeExists: boolean; payTemplateId: string | null }>>
  >;
  openSchedulingPayData(options: {
    userIds: readonly string[];
    onSnapshot(snapshot: Readonly<{
      templates: ReadonlyArray<unknown>;
      contexts: ReadonlyArray<Readonly<{ userId: string; employeeExists: boolean; payTemplateId: string | null }>>;
    }>): void;
    onInvalidated?(): void;
    onError?(error: unknown): void;
  }): Readonly<{ load(options?: { force?: boolean }): Promise<void>; stop(): void }>;
  followSchedulingPayData(options: { userIds?: readonly string[]; onChange(): void; onError?(error: unknown): void }): () => void;
  fetchTimesheets(query?: HostTimesheetQuery): Promise<ReadonlyArray<HostTimesheet>>;
  fetchTimesheet(id: string): Promise<HostTimesheet | null>;
  timesheetsSnapshot(query?: HostTimesheetQuery): Promise<{
    readonly timesheets: ReadonlyArray<HostTimesheet>;
    readonly unresolved: boolean;
  }>;
  followTimesheets(query: HostTimesheetQuery, onInvalidate: () => void): () => void;
  requiredClockInVideos(teamMemberId: string): Promise<
    ReadonlyArray<{ videoId: string; title: string; watched: boolean }>
  >;
  recordVideoView(args: { videoId: string }): Promise<void>;
  tenantSetting(
    key: string,
  ): Promise<string | number | boolean | null>;
  // Connection state only, never secrets.
  integrationSettings(
    category: 'payroll' | 'accounting' | 'payments',
  ): Promise<{
    readonly provider: string;
    readonly connected: boolean;
    readonly capabilities?: readonly string[];
  }>;
  // Connection state and an opaque ref only, never secrets.
  integration(
    provider: string,
  ): Promise<{
    readonly connected: boolean;
    readonly accountRef?: string;
    readonly chargesEnabled?: boolean;
  } | null>;
}

export interface PayTemplatesChangedTrigger {
  readonly at: Iso8601;
  readonly teamMemberId?: string;
}

export interface MessagingApi {
  resetSession(): Promise<void>;
  // Messaging content is not a platform primitive: resetSession is the only host messaging method.
}

export type WithActor<T> = T & { targetTeamMemberId?: string };

export type IanaTz = string;

export interface ClockScheduleOptions {
  readonly schedule:
    | { kind: 'cron'; cron: string; timezone: IanaTz }
    | {
        kind: 'at';
        at: Iso8601;
        recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
      };
  readonly jitterSec?: number;
  readonly catchUpPolicy?: 'skip' | 'fire_once';
}

export interface ClockScheduledTrigger {
  readonly firedAt: Iso8601;
  readonly scheduledFor: Iso8601;
  readonly timezone: IanaTz;
  readonly occurrenceKey: string;
}

export interface ClockRelativeTrigger {
  readonly firedAt: Iso8601;
  readonly anchor: Iso8601;
  readonly offsetSec: number;
  readonly occurrenceKey: string;
}

export interface ClockNow {
  readonly instant: Iso8601;
  readonly tenantLocal: Iso8601;
  readonly timezone: IanaTz;
  readonly epochMs: number;
}

export interface ClockTimezone {
  readonly timezone: IanaTz;
  readonly utcOffsetMinutes: number;
  readonly dstActive: boolean;
}

export interface ClockApi {
  now(): Promise<ClockNow>;
  timezone(): Promise<ClockTimezone>;
}

export interface LifecycleAppResumedTrigger {
  readonly resumedAt: Iso8601;
  readonly awayMs?: number;
  readonly coldStart: boolean;
}

export interface LifecycleAppBackgroundedTrigger {
  readonly backgroundedAt: Iso8601;
}

export interface LifecycleNetworkOnlineTrigger {
  readonly at: Iso8601;
  readonly type: NetworkStatus['type'];
}

export interface LifecycleNetworkOfflineTrigger {
  readonly at: Iso8601;
}

export interface DisplayEpisodeTicket {
  current(): boolean;
  stop(): void;
}

export interface DisplayOwner extends DisplayEpisodeTicket {
  assertCurrent(): void;
}
export declare function createDisplayOwner(
  tommy: { readonly lifecycle?: Partial<LifecycleApi> } | null | undefined,
  options?: { current?: () => boolean; onRetire?: () => void },
): Readonly<DisplayOwner>;

export interface LifecycleApi {
  captureDisplayEpisode(): DisplayEpisodeTicket;
}

export interface NotificationOpenedTrigger {
  readonly notificationId: string;
  readonly channel: 'push' | 'inapp';
  readonly openedBy: string;
  readonly openedAt: Iso8601;
  readonly deepLink?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface NotificationsApi {
  send_push(args: {
    to: string | readonly string[];
    title: string;
    body: string;
    data?: Readonly<Record<string, unknown>>;
    badge?: number;
    deepLink?: string;
  }): Promise<{ notificationId: string; deliveredDeviceCount: number }>;
  send_inapp_notification(args: {
    to: string | readonly string[];
    title: string;
    body: string;
    category?: string;
    deepLink?: string;
    level?: 'info' | 'success' | 'warning' | 'error';
  }): Promise<{ notificationId: string }>;

}

export interface SessionUser {
  readonly userId: string;
  readonly teamMemberId?: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly isKioskActor: boolean;
}

export interface SessionUserLoggedInTrigger {
  readonly userId: string;
  readonly teamMemberId?: string;
  readonly at: Iso8601;
  readonly method: string;
  readonly isKioskActor: boolean;
}

export interface SessionUserLoggedOutTrigger {
  readonly userId: string;
  readonly teamMemberId?: string;
  readonly at: Iso8601;
  readonly reason: string;
}

export interface SessionActiveUserChangedTrigger {
  readonly previousTeamMemberId?: string;
  readonly activeTeamMemberId: string;
  readonly at: Iso8601;
  readonly via: string;
}

export interface UserRoleChangedTrigger {
  readonly teamMemberId: string;
  readonly addedRoles: readonly string[];
  readonly removedRoles: readonly string[];
  readonly at: Iso8601;
  readonly changedBy?: string;
}

export interface SessionApi {
  current_user(): Promise<SessionUser | null>;
  current_role(): Promise<{ roles: readonly string[]; primaryRole?: string }>;
  is_authenticated(): Promise<boolean>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UserApi {}

// Payloads carry ids, never records; subscribers re-resolve via tommy.directory.resolve.

export interface DirectoryTeamMemberAddedTrigger {
  readonly teamMemberId: string;
  readonly at: Iso8601;
}

export interface DirectoryTeamMemberUpdatedTrigger {
  readonly teamMemberId: string;
  readonly changedFields: readonly string[];
  readonly at: Iso8601;
}

export interface DirectoryTeamMemberDeactivatedTrigger {
  readonly teamMemberId: string;
  readonly at: Iso8601;
  readonly effectiveAt?: Iso8601;
}

export interface DirectoryClientAddedTrigger {
  readonly clientId: string;
  readonly at: Iso8601;
}

export interface DirectoryClientUpdatedTrigger {
  readonly clientId: string;
  readonly changedFields: readonly string[];
  readonly at: Iso8601;
}

export interface DirectoryEntityChangedTrigger {
  readonly kind: 'location' | 'role' | 'tag';
  readonly entityId: string;
  readonly change: 'added' | 'updated' | 'removed';
  readonly at: Iso8601;
}

export interface BillingActionsUsage {
  readonly allowance: number;
  readonly used: number;
  readonly remaining: number;
  readonly usedPct: number;
  readonly periodStart: Iso8601;
  readonly periodEnd: Iso8601;
  readonly overageUnits: number;
  readonly hardCapEnabled: boolean;
  readonly topupCreditsAvailable?: number;
}

export interface BillingAllowanceWarningTrigger {
  readonly tenantId: string;
  readonly periodStart: Iso8601;
  readonly periodEnd: Iso8601;
  readonly allowance: number;
  readonly used: number;
  readonly usedPct: number;
  readonly threshold: number;
  readonly projectedOverageAt?: Iso8601;
}

export interface BillingOverAllowanceTrigger {
  readonly tenantId: string;
  readonly periodStart: Iso8601;
  readonly periodEnd: Iso8601;
  readonly overageUnits: number;
  readonly hardCapEnabled: boolean;
  readonly coverage: string;
}

export interface BillingPlanChangedTrigger {
  readonly tenantId: string;
  readonly previousPlanId: string;
  readonly newPlanId: string;
  readonly previousAllowance?: number;
  readonly newAllowance?: number;
  readonly effectiveAt: Iso8601;
  readonly reason: string;
}

export interface BillingApi {
  actions_usage(args?: { tenantId?: string }): Promise<BillingActionsUsage>;

}

export interface ActionDeadLetteredTrigger {
  readonly tenantId: string;
  readonly runId: string;
  readonly rootRunId: string;
  readonly kind: string;
  readonly activityName?: string;
  readonly triggerName?: string;
  readonly sourceMpId: MpId;
  readonly targetMpId: MpId;
  readonly errorCode: TommyErrorCode;
  readonly attempts: number;
  readonly deadLetteredAt: Iso8601;
}

export interface SyncCompletedTrigger {
  readonly completedAt: Iso8601;
  readonly drainedCount: number;
  readonly conflictsResolved: number;
  readonly failedCount: number;
  readonly mpId?: MpId;
}

export interface SyncConflictDetectedTrigger {
  readonly mpId: MpId;
  readonly storeName: string;
  readonly recordKey: string;
  readonly strategy: string;
  readonly resolution: string;
  readonly localRev?: string;
  readonly remoteRev?: string;
  readonly detectedAt: Iso8601;
}

export interface OpenTarget {
  readonly mpId: MpId;
  readonly route: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly mode?: 'page' | 'modal';
}

export interface OpenResult<R = unknown> {
  readonly completed: boolean;
  readonly result?: R;
}

export interface NavigationBackOptions {
  readonly [key: string]: unknown;
}

export interface NavigationBackResult {
  readonly back: boolean;
  readonly deferred?: boolean;
}

export interface NavigationApi {
  open(path: string, opts?: Readonly<Record<string, unknown>>): { opened: boolean; deferred?: boolean };
  back(fallbackPath?: string, opts?: NavigationBackOptions): NavigationBackResult;
  open<R = unknown>(target: OpenTarget): Promise<OpenResult<R>>;
  complete(result?: unknown): void;
  canOpen(mpId: MpId): Promise<boolean>;
}

// Kept per account on the device, never sent anywhere.
export interface PrefsApi {
  ready(): Promise<void>;
  get<T = unknown>(key: string): T | null;
  get<T>(key: string, fallback: T): T | (undefined extends T ? null : never);
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface TimePreferences {
  readonly timezone_mode: 'auto' | 'manual';
  readonly manual_timezone: string | null;
  readonly date_format: 'locale' | 'day_first' | 'month_first' | 'iso' | 'written';
  readonly time_format: 'locale' | '12h' | '24h';
  readonly timezone_label: 'name_offset' | 'offset';
  readonly comparison_tooltips: boolean;
  readonly revision: number;
}

export interface ViewerTimezone {
  readonly timezone: string;
  readonly source: 'manual' | 'detected' | 'cached' | 'business_fallback' | 'system_fallback';
  readonly detectedTimezone: string | null;
  readonly fallbackReason: 'MANUAL_TIMEZONE_INVALID' | 'DEVICE_TIMEZONE_UNAVAILABLE' | null;
}

export interface TimeDisplayOptions {
  readonly timezone: string;
  readonly locale?: string;
  readonly kind?: 'datetime' | 'date' | 'time';
  readonly includeZone?: 'auto' | 'always';
  readonly absoluteZone?: boolean;
}

export interface ZonedTimeText {
  readonly text: string;
  readonly timezone: string;
  readonly offset: string;
  readonly city: string;
  readonly diffHours: number;
  readonly zoneLabel: string;
}

export interface TimeDisplay extends ZonedTimeText {
  readonly datetime: Iso8601;
  readonly showZone: boolean;
  readonly mismatch: boolean;
  readonly comparison: ZonedTimeText | null;
  readonly viewer: ViewerTimezone;
  readonly diagnostics: ReadonlyArray<string>;
}

export interface TimeRangeDisplay extends TimeDisplay {
  readonly start: TimeDisplay;
  readonly end: TimeDisplay;
}

export interface ZoneSummary {
  readonly timezone: string;
  readonly city: string;
  readonly mismatch: boolean;
  readonly diffHours: number;
  readonly diffText: string;
  readonly distanceText: string;
  readonly ahead: boolean;
}

export interface ResolvedWallTime {
  readonly instant: Iso8601;
  readonly timezone: string;
  readonly offset: string;
  readonly ambiguous: boolean;
}

export interface CalendarDayBounds {
  readonly date: string;
  readonly timezone: string;
  readonly start: Iso8601;
  readonly end: Iso8601;
  readonly startOffset: string;
  readonly endOffset: string;
  readonly durationMinutes: number;
  readonly adjustedStart: boolean;
  readonly adjustedEnd: boolean;
  readonly diagnostics: ReadonlyArray<Readonly<{
    code: 'TIMEZONE_CALENDAR_BOUNDARY_SHIFTED';
    boundary: 'start' | 'end';
    requestedDate: string;
    actualDate: string;
    time: string;
  }>>;
}

export type TimeDisplayErrorCode =
  | 'TIMEZONE_INVALID' | 'TIMEZONE_UNSUPPORTED' | 'TIMEZONE_CONTEXT_STALE'
  | 'TIME_DATE_INVALID' | 'TIME_INSTANT_INVALID' | 'TIME_RANGE_REVERSED'
  | 'TIME_DISPLAY_KIND_INVALID' | 'TIME_DISPLAY_LOCALE_UNSUPPORTED'
  | 'TIME_WALL_CLOCK_INVALID' | 'TIME_DISAMBIGUATION_INVALID'
  | 'TIMEZONE_WALL_TIME_NONEXISTENT' | 'TIMEZONE_WALL_TIME_AMBIGUOUS'
  | 'TIMEZONE_RULES_CONFLICT' | 'TIMEZONE_OFFSET_UNAVAILABLE'
  | 'TIMEZONE_CALENDAR_DATE_SKIPPED' | 'TIMEZONE_CALENDAR_DATE_DISCONTIGUOUS';

export interface TimeDisplayError extends RangeError {
  readonly code: TimeDisplayErrorCode;
  readonly timezone?: string;
  readonly instant?: Iso8601;
  readonly date?: string;
  readonly time?: string;
  readonly choices?: ReadonlyArray<Readonly<{ instant: Iso8601; offset: string }>>;
  readonly segments?: ReadonlyArray<Readonly<{ start: Iso8601; end: Iso8601 }>>;
}

// Private preferences never enter an MP store.
export interface TimeApi {
  formatInstant(value: Iso8601, options: TimeDisplayOptions): TimeDisplay;
  formatRange(start: Iso8601, end: Iso8601, options: TimeDisplayOptions): TimeRangeDisplay;
  formatDateOnly(value: string, options?: { readonly locale?: string }): string;
  zoneSummary(timezone?: string | null, options?: { readonly locale?: string; readonly at?: Iso8601 }): ZoneSummary;
  viewer(): ViewerTimezone;
  context(): Readonly<{ teamTimezone: string | null; enabled: boolean }>;
  zones(): ReadonlyArray<string>;
  calendarParts(value: Iso8601, options: { readonly timezone: string }): Readonly<{
    date: string; time: string; weekday: number;
  }>;
  dayBounds(date: string, options: { readonly timezone: string }): CalendarDayBounds;
  resolveWallTime(options: {
    readonly date: string;
    readonly time: string;
    readonly timezone: string;
    readonly disambiguation?: 'earlier' | 'later';
  }): ResolvedWallTime;
}

export interface StoreMigrationContext {
  fromSchema: number;
  toSchema: number;
  store: string;
}

export type StoreMigrate = (row: Record<string, unknown>, context: StoreMigrationContext) => Record<string, unknown> | null;

export interface TommySdk {
  readonly init: MpInit;
  readonly prefs: PrefsApi;
  readonly time: TimeApi;
  readonly actions: ActionsApi;
  readonly panels: PanelsApi;
  readonly data: DataApi;
  readonly ui: UiApi;
  readonly directory: DirectoryApi;
  readonly device: DeviceApi;
  readonly theme: ThemeApi;
  readonly host: HostApi;
  readonly navigation: NavigationApi;
  readonly messaging: MessagingApi;
  readonly clock: ClockApi;
  readonly lifecycle: LifecycleApi;
  readonly notifications: NotificationsApi;
  readonly session: SessionApi;
  readonly user: UserApi;
  readonly billing: BillingApi;
  readonly log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, extra?: unknown) => void;
  readonly t: (key: string, fallback: string, vars?: Record<string, unknown>) => string;
}

declare global {
  // eslint-disable-next-line no-var
  var tommy: TommySdk;
}
export declare function visibleChatMessageIds(
  elements: Iterable<{ dataset?: { chatMessageId?: string }; isConnected?: boolean; getBoundingClientRect?: () => { top: number; left: number; bottom: number; right: number } }>,
  options: { active?: boolean; viewport: { top: number; left: number; bottom: number; right: number }; windowBounds: { top: number; left: number; bottom: number; right: number } },
): string[];

export declare function visibleChatConversationIds(
  elements: Iterable<{ dataset?: { conversationId?: string }; isConnected?: boolean; getBoundingClientRect?: () => { top: number; left: number; bottom: number; right: number } }>,
  options: { active?: boolean; viewport: { top: number; left: number; bottom: number; right: number }; windowBounds: { top: number; left: number; bottom: number; right: number } },
): string[];

export declare const CHAT_SEND_NOTICE_MS: 30000;
export declare function createChatSendFeedback(options: {
  read: () => Iterable<{ key: string; startedAt: number; pending: boolean }>;
  onChange: (delayed: Set<string>) => void;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}): Readonly<{ refresh(): void; dispose(): void }>;
