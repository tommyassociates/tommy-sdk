/**
 * 2.4 — Inter-MP Bus & SDK surface — TypeScript types.
 *
 * The public type surface of `@tommy/sdk`, the runtime loaded by every Mini
 * Program — inside its own iframe in sandboxed mode, or in the shell's realm
 * via the direct adapter in in-process mode (`execution-modes.md`). The
 * surface is identical in both modes; an MP cannot detect its mode through
 * this API. This file is the contract; no `any` in the public
 * surface. Per-MP trigger/condition/activity types are *generated* from the
 * manifest (Phase 5.2) and intersected with these generics so an author gets
 * autocomplete on their own contracts.
 *
 * Status: specification artefact (Phase 2). Not wired to an implementation yet.
 */
/*
 * VENDORED from plans/refactor-plan/02-architecture/sdk-types.ts (D22 seed,
 * authoritative). ONE extension flagged per sdk-broker harden round-1:
 * TommyErrorCode adds 'Offline' (offline-sync.md §7 — a non-replayable
 * activity invoked offline rejects with a typed Offline error; the code was
 * required by behaviour but absent from every catalogue) and 'UnknownMethod'
 * (the Phase 5.3 unknown-method guard). Everything else is verbatim.
 */

// ============================================================================
// Primitives
// ============================================================================

export type MpId = string;
export type Surface =
  | 'dashboard'
  | 'team_member_details'
  | 'client_details'
  | 'full_page';
export type Iso8601 = string;

/** Opaque, short-lived, signed. Issued in the handshake; attached to every RPC. */
export type CapabilityToken = string & { readonly __brand: 'CapabilityToken' };

// ============================================================================
// Errors — typed, named codes
// ============================================================================

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
  | 'RateLimited'
  | 'CapabilityTokenInvalid'
  | 'LoopDetected'
  | 'ChainDepthExceeded'
  | 'FanoutLimitExceeded'
  | 'DevicePermissionDenied'
  | 'DeviceUnavailable'
  | 'Offline'
  | 'UnknownMethod';

/**
 * Every rejection from the SDK is a TommyError. `code` is machine-checkable;
 * `rule` names the exact contract clause that was violated (schema-first errors).
 */
export interface TommyError {
  readonly name: 'TommyError';
  readonly code: TommyErrorCode;
  /** Human-readable, names the broken rule. e.g. "activity 'x' not in authorizedCallers". */
  readonly message: string;
  /** The manifest/schema path that failed, when applicable. */
  readonly rule?: string;
  /** Whether the broker considers this retryable (Timeout / network / 503). */
  readonly retryable: boolean;
  /** Correlates with the ActionRun record for debugging. */
  readonly runId?: string;
  readonly cause?: unknown;
}

// ============================================================================
// Actions bus
// ============================================================================

export interface EmitReceipt {
  readonly emitId: string;
  /** Subscribers the broker delivered to immediately. */
  readonly deliveredTo: number;
  /** Subscribers offline at emit time; will receive on replay. */
  readonly queuedFor: number;
}

export type InvokeStatus = 'succeeded' | 'failed' | 'dead_letter' | 'queued_offline';

export interface InvokeResult<R = unknown> {
  readonly rpcId: string;
  readonly status: InvokeStatus;
  /** Present when status === 'succeeded'; validated against the activity resultSchema. */
  readonly result?: R;
  readonly error?: TommyError;
}

export type Handler<P = unknown> = (payload: P, meta: TriggerMeta) => void | Promise<void>;

export interface TriggerMeta {
  readonly emitId: string;
  readonly emitterMpId: MpId;
  readonly ts: Iso8601;
  /** False when delivered from the offline replay queue. */
  readonly live: boolean;
}

export type Unsubscribe = () => void;

/** One queued call inside `batch()`. Each resolves/rejects independently. */
export type BatchCall =
  | { kind: 'emit'; trigger: string; payload: unknown }
  | { kind: 'query'; condition: string; args: unknown }
  | { kind: 'invoke'; activity: string; args: unknown };

export interface TransactionContext {
  readonly txnId: string;
  invoke<R = unknown>(activity: string, args: unknown): Promise<InvokeResult<R>>;
}

/**
 * Declarative, non-Turing-complete arg assembly for an Action's activity binding.
 * The original four shapes (actions-runtime.md §9.7) plus the 2.22 additions:
 * serviceRead (E6), item (E5 forEach element), template (E3). Every non-template
 * shape may carry a closed-operator transform chain (E2, max 8 steps).
 */
export type InputMapSource =
  | { from: 'trigger'; path: string; default?: unknown; transform?: TransformChain }
  | { from: 'condition'; ref: string; path: string; default?: unknown; transform?: TransformChain }   // ref = a conditions[] entry (its `ref` alias, defaulting to name)
  | { from: 'serviceRead'; ref: string; path: string; default?: unknown; transform?: TransformChain } // 2.22 E6 — a serviceReads[] entry
  | { from: 'option'; path: string; default?: unknown; transform?: TransformChain }
  | { from: 'item'; path: string; default?: unknown; transform?: TransformChain }                     // 2.22 E5 — the current forEach element
  | { const: unknown; default?: unknown }
  | { template: string; default?: unknown };                                                          // 2.22 E3 — plain text; {{source.path | op(args)}} placeholders; rendered as data, never HTML

/** Map of activity-input field -> single source. Produces exactly one args object; broker validates against the activity inputSchema. */
export type InputMap = Record<string, InputMapSource>;

/**
 * 2.22 E2 — the closed, total, in-binary transform operator set (one interpreter
 * family with remote-configurability.md §6 L6: operators live in the binary,
 * config supplies operands, nothing composes into arbitrary computation).
 * Signatures: actions-configurability.md §2.2. Extending this union is a
 * PLATFORM release, never config.
 */
export type TransformOp =
  | 'concat' | 'upper' | 'lower' | 'trim' | 'slice' | 'replace'
  | 'add' | 'subtract' | 'multiply' | 'divide' | 'round' | 'clamp'
  | 'format' | 'add_duration' | 'diff' | 'day_of_week' | 'bucket_time'
  | 'coalesce' | 'default' | 'exists' | 'not' | 'equals'
  | 'map'
  | 'first' | 'last' | 'count' | 'sum' | 'pluck' | 'join' | 'find' | 'filter';

export interface TransformStep { op: TransformOp; args?: Record<string, unknown> }
/** Max 8 steps (schema-enforced); each step type-checked against the source/target schemas at manifest validation. */
export type TransformChain = TransformStep[];

/** 2.22 E4/E7 — a closed L6-comparator predicate over declared sources (activity.select `when`; interactions `visibleWhen`). One composition level. */
export type Predicate =
  | { source: InputMapSource; op: 'exists' | 'not_exists' | 'equals' | 'not_equals' | 'one_of' | 'range'; operand?: unknown; operands?: unknown[] }
  | { allOf: Predicate[] }
  | { anyOf: Predicate[] };

/** 2.22 E4 — one branch of activity.select. Ordered, first-match-wins; the terminal branch MUST be `else` (validator-enforced) and may `skip`. */
export type SelectBranch =
  | { when: Predicate; mp?: string; name: string; inputMap?: InputMap }
  | { else: true; mp?: string; name: string; inputMap?: InputMap }
  | { else: true; skip: true };

/** 2.22 E5 — bounded fan-out over a condition/serviceRead-returned collection. ONE metered execution; each element dispatch is a child run. */
export interface ForEachDecl { from: InputMapSource; maxItems: number }

/** 2.22 E6 — a host service-read declared as a wiring source (leased under the installer tenant's existing grants; joins the §9.6 dependency surface). */
export interface ServiceReadDecl { ref: string; name: `tommy.${string}`; input?: InputMap }

/** 2.22 §2.7 — the declarative pre-dispatch confirm guard. Decline = a typed skip recorded on the action-run. */
export interface ConfirmGuard { title: string; message: string; confirmLabel?: string; destructive?: boolean }

/**
 * 2.22 E7 (D20) — a declared interaction point (contributions.interactions[]):
 * SDK-rendered affordance emitting the MP-owned trigger `<mpId>.ui.<id>` with
 * zero MP code. Payload binds ONLY from the declared view context. visibleWhen
 * gates visibility, never authority (L3). hideWhenUnwired default true (D21).
 */
export interface InteractionDeclaration {
  id: string;
  kind: 'button' | 'menu_item' | 'list_row_action' | 'fab' | 'link';
  surface: { route: string } | { panel: string };
  label: { key: string };
  icon?: string;
  payload: Record<string, { from: 'route'; param: string } | { from: 'context'; path: string } | { const: unknown }>;
  visibleWhen?: Predicate;
  hideWhenUnwired?: boolean; // default true
}

/**
 * 2.22 §4 (D19) — a Computed Action function declaration (manifest `functions:`).
 * Packaged inside the reviewed MP artifact (functions/ dir); executes SERVER-SIDE
 * in the Action Function Runtime (pure compute, no I/O; inputs assembled by the
 * platform through the leased/audited path); returns the intent envelope. Each
 * entry is a PrimitiveContract row (2.21) and a computed consumer (2.21 §3.1).
 */
export interface FunctionDeclaration {
  entry: `functions/${string}`;
  runtime: 'afr-js@1';
  description: string;
  inputSchema?: object;
  resultSchema: object;
  timeoutMs: number; // <= 5000
  memoryMb: number;  // <= 128
  reads: { conditions?: string[]; serviceReads?: `tommy.${string}`[] };
  targets: { activities: string[] };
  contractVersion?: string;
  deprecated?: { replacement?: string; removeAfter?: string };
}

/** The standard envelope an AFR function receives (2.22 §4.3). `now`/`random` are injected — runs are deterministic and inspector-replayable. */
export interface FunctionInput<TriggerPayload = unknown, Options = unknown> {
  trigger: TriggerPayload;
  conditions: Record<string, unknown>;   // keyed by declared reads.conditions refs
  serviceReads: Record<string, unknown>; // keyed by declared reads.serviceReads refs
  options: Options;
  now: string;        // ISO instant, injected
  randomSeed: string; // seeded randomness, injected
}

/**
 * FINALIZED 2026-07-02 (D19 — actions-configurability.md 2.22 §4; supersedes the
 * old "DEFERRED" marker here). A Computed Action returns the invoke INTENT —
 * a single envelope, a capped array (fan-out), or a typed skip; the server-side
 * executor validates args against the target inputSchema, enforces
 * authorizedCallers + tenant grants, and dispatches. The function NEVER invokes.
 */
export type ComputedActionResult =
  | { activity: { mp: string; name: string }; args: unknown; idempotencyKey?: string }
  | { activity: { mp: string; name: string }; args: unknown; idempotencyKey?: string }[]
  | { skip: true };

/** 2.22 §5 — the Solution schema: the declarative bundle the AI composer emits and an admin approves. Compose-never-widen: no code, no grants. */
export interface SolutionSchema {
  id: string;
  version: number;
  audience: { teamType?: string; flags?: string[] } | { tenantId: string };
  mps: { mpId: string }[];
  actions: { actionId: string; enabled: boolean; options?: Record<string, unknown> }[];
  rules?: { key: string; op: 'compare' | 'range' | 'one_of' | 'required' | 'default'; operands: unknown[] }[];
  config?: Record<string, unknown>; // 2.20 namespaces subset, schema-validated per namespace
}

/**
 * The Actions bus. `T` is the manifest-generated map of this MP's own
 * triggers/conditions/activities; left generic here.
 */
export interface ActionsApi {
  /** Emit a trigger. Async fan-out by default. Rejects InvalidPayload before reaching the broker. */
  emit(trigger: string, payload: unknown): Promise<EmitReceipt>;

  /** Evaluate another MP's condition. Rejects Timeout / UnknownCondition / ConditionError. */
  query<R = unknown>(condition: string, args: unknown): Promise<R>;

  /**
   * Invoke another MP's activity. Idempotency key formed per the target manifest.
   * Signature unchanged for inputMap-driven Actions: the broker assembles `args`
   * from the Action's InputMap (see InputMapSource), so `args` is broker-supplied
   * rather than caller-supplied in that path.
   */
  invoke<R = unknown>(activity: string, args: unknown): Promise<InvokeResult<R>>;

  /** Subscribe to a trigger. Returns an unsubscribe fn; also auto-removed on MP teardown. */
  subscribe<P = unknown>(trigger: string, handler: Handler<P>): Unsubscribe;

  /** Transport batching — fewer RPC round-trips (sandboxed mode); pass-through in-process. Not an atomicity guarantee. */
  batch(calls: readonly BatchCall[]): Promise<ReadonlyArray<PromiseSettledResult<unknown>>>;

  /** Best-effort saga: shared txnId, FIFO order, compensating activities on failure. */
  transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
}

// ============================================================================
// Handshake & context (host -> MP, see isolation-model.md §6)
// ============================================================================

export interface TenantContext {
  readonly tenantId: string;
  readonly displayName: string;
  /** Coarse role tags only — NOT the full account/user graph (audit 1.8 fix). */
  readonly roles: readonly string[];
}

export interface SurfaceContext {
  readonly surface: Surface;
  /** Present on team_member_details; the only host data that crosses. */
  readonly teamMemberId?: string;
  /** Present on client_details; the only host data that crosses. */
  readonly clientId?: string;
}

export interface MpInit {
  readonly instanceId: string;
  readonly tenant: TenantContext;
  readonly locale: string;
  /** Resolved theme — tokens + mode. The SDK applies it before first paint. */
  readonly theme: ThemeContext;
  readonly capabilityToken: CapabilityToken;
  /** Intersection of manifest-declared and tenant-granted scopes. Advisory for UI. */
  readonly grantedScopes: readonly string[];
  readonly surfaceContext: SurfaceContext;
  /**
   * This MP's per-tenant config, validated against panels[].configSchema.
   * Delivery channel of the one remote-config service (remote-configurability.md 2.20):
   * server-resolved + version-pinned for this (user, tenant); published already-resolved, not a fetch channel.
   */
  readonly mpConfig: Readonly<Record<string, unknown>>;
  /** Exact shared-dependency versions the host expects (kills version drift, audit 1.7). */
  readonly sharedDeps: Readonly<Record<string, string>>;
}

// ============================================================================
// Theming (see theming.md)
// ============================================================================

/** Resolved theme mode — 'system' is resolved to one of these host-side. */
export type ThemeMode = 'light' | 'dark';

/** Design-system tokens — the ~328 --tommy-* CSS custom properties. */
export type ThemeTokens = Readonly<Record<`--tommy-${string}`, string>>;

export interface ThemeContext {
  /** Resolved mode for the current Day/Night/System setting. */
  readonly mode: ThemeMode;
  /** Value for the MP document's CSS `color-scheme` (sandboxed mode; in-process MPs inherit the shell's). */
  readonly colorScheme: ThemeMode;
  /** Full --tommy-* token set for `mode`. The SDK applies these to :root. */
  readonly tokens: ThemeTokens;
}

/**
 * Theme access. The SDK applies tokens to the MP document automatically — CSS
 * `var(--tommy-*)` re-themes with no MP code. This API is for the rare MP that
 * must react in JS (redraw a canvas, swap a raster asset).
 */
export interface ThemeApi {
  readonly current: ThemeContext;
  onChange(handler: (theme: ThemeContext) => void): Unsubscribe;
}

// ============================================================================
// Panel runtime (see panel-runtime.md)
// ============================================================================

export type PanelStatus =
  | 'discovered'
  | 'loading'
  | 'ready'
  | 'stale'        // rendered from cache, revalidating
  | 'needs_connection'
  | 'error';

/** Host-assigned geometry for one panel (host grid cells in-process; cell coordinates inside the MP's surface iframe in sandboxed mode). */
export interface PanelCell {
  readonly panelId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * One panel PLACED on a composed dashboard tab — a `panels[]` entry of the
 * `dashboards` team Setting document (scope 01c). The composition references
 * panels by (mpId, panelId); the manifest declaration stays the authority on
 * eligibility, rbac and size bounds at resolve time. `mpId` is `"core"` for
 * legacy first-party panels.
 */
export interface ComposedPanelInstance {
  /** Placement uuid — the tile key; the same panel may be placed twice on one tab. */
  readonly id: string;
  readonly mpId: MpId;
  readonly panelId: string;
  /** Grid units on the host's 12-column grid (w 1–12; clamped to the declaration's size envelope at resolve time). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Per-placement parameter bindings: fed from surface context, pinned statically by the admin, or left to the declaration default. */
  readonly params?: Readonly<Record<string,
    | { readonly source: 'context' }
    | { readonly source: 'static'; readonly value: unknown }
    | { readonly source: 'default' }>>;
  /** Per-tenant panel config validated against the manifest configSchema. */
  readonly config?: Readonly<Record<string, unknown>>;
  /**
   * Placement-level audience targeting. Entries are tag ids (`members` may
   * also hold a userId). AND across present non-empty contexts, OR within a
   * list; absent/empty = everyone.
   */
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

/**
 * One resolved tile of a composed tab: the placement joined to its manifest
 * declaration and the grid cell it occupies. `decl` is null when the placing
 * MP is uninstalled or no longer declares the panel — the entry is KEPT and
 * the host renders an unavailable tile in its cell (a stored composition
 * never silently loses a placement). The declaration's shape is owned by the
 * manifest schema, not this contract — opaque here.
 */
export interface ResolvedPanelEntry {
  readonly instance: ComposedPanelInstance;
  readonly decl: Readonly<Record<string, unknown>> | null;
  readonly cell: PanelCell;
}

export interface PanelContext {
  readonly panelId: string;
  readonly surface: Surface;
  readonly surfaceContext: SurfaceContext;
  /** Per-tenant panel config validated against the manifest configSchema. */
  readonly config: Readonly<Record<string, unknown>>;
  readonly online: boolean;
}

/** What an MP implements per panel. Mounted inside a closed Shadow DOM root. */
export interface PanelDefinition {
  readonly id: string;
  /** Load data needed before first paint. Honour the per-panel timeout. */
  load(ctx: PanelContext): Promise<void>;
  /** Render into the provided shadow root. */
  render(root: ShadowRoot, ctx: PanelContext): void | Promise<void>;
  /** Optional: respond to a refresh tick / trigger. */
  refresh?(ctx: PanelContext): void | Promise<void>;
  unmount?(): void;
}

export interface PanelsApi {
  /** Register a panel implementation for an id declared in the manifest. */
  register(def: PanelDefinition): void;
  /** Request the host to navigate (panels cannot navigate the shell directly). */
  requestNavigation(target: { route: string; params?: Record<string, string> }): Promise<void>;
  /** Tell the host this panel's content size changed (host re-flows the grid). */
  reportSize(panelId: string, size: { w: number; h: number }): void;
}

// ============================================================================
// Local data (per-MP IndexedDB — see offline-sync.md)
// ============================================================================

/**
 * A memoised derived view over a store's normalized entities. `subscribeQuery`
 * recomputes a Selector ONLY when an entity it read changes, and fires the
 * handler with the new derived value — not the whole store. This is the typed
 * surface behind data-fabric.md §4.2/§9 (per-selector reactive fan-out); the
 * fabric memoises each Selector so a single entity change recomputes only the
 * affected selectors. `Query<Rec>` is the read-only accessor the selector reads
 * through (get-by-id / getAll / index range) — the fabric tracks which entities
 * a selector touched to decide what to recompute.
 */
export interface Query<Rec = unknown> {
  get(key: IDBValidKey): Rec | undefined;
  getAll(query?: { index?: string; range?: IDBKeyRange }): readonly Rec[];
}
export type Selector<Rec, V> = (q: Query<Rec>) => V;

export interface DataStore<Rec = unknown> {
  get(key: IDBValidKey): Promise<Rec | undefined>;
  getAll(query?: { index?: string; range?: IDBKeyRange }): Promise<Rec[]>;
  put(record: Rec): Promise<IDBValidKey>;
  delete(key: IDBValidKey): Promise<void>;
  /**
   * Whole-store reactive callback (UNCHANGED, back-compat). Fires on local
   * writes and sync-applied remote changes with the full record set; the
   * subscriber derives its own views. Re-runs on ANY change to the store.
   */
  subscribe(handler: (records: Rec[]) => void): Unsubscribe;
  /**
   * ADDITIVE selector subscription (data-fabric.md §4.2). The fabric memoises
   * `selector` and fires `handler` with its new value ONLY when an entity the
   * selector read changes — so a change recomputes only the affected selectors,
   * not every subscriber. Fires on local write, sync-applied remote change, and
   * real-time push. Does NOT replace the whole-store overload above.
   */
  subscribeQuery<V>(selector: Selector<Rec, V>, handler: (value: V) => void): Unsubscribe;
}

export interface DataApi {
  /** Open one of the object stores declared in manifest.localData. */
  store<Rec = unknown>(name: string): DataStore<Rec>;
  /** Sync status for a store, for stale-while-revalidate UX + the brownout contract. */
  syncState(storeName: string): {
    lastSyncedAt: Iso8601 | null;
    pending: number;
    online: boolean;
    /** Per-namespace circuit-breaker state — the fault signal for the brownout contract (data-fabric.md §7). */
    breaker?: 'closed' | 'open' | 'half_open';
    /** True when the namespace is serving stale cache because revalidation is failing/slow (distinct from offline). */
    stale?: boolean;
  };
}

// ============================================================================
// Host UI & Directory services (see host-services.md)
// ============================================================================

/** roles / tags / skills / locations are tag-family entities in Tommy; team
 *  members and clients are separate. `client` is a platform service exposed
 *  here as a directory kind (loop-review X4–X5). */
export type DirectoryKind =
  | 'team_member' | 'location' | 'role' | 'skill' | 'tag' | 'client';

/** Minimal reference to a directory entity. Never a full record. */
export interface EntityRef {
  readonly kind: DirectoryKind;
  readonly id: string;
  readonly displayName: string;
}

export interface PickerOptions {
  /** Entity ids pre-selected when the picker opens. */
  readonly preselected?: readonly string[];
  /** Optional modal title. */
  readonly title?: string;
}

export interface PickOptions extends PickerOptions {
  /**
   * One or more entity kinds the picker may select. A single picker call MAY
   * mix kinds (e.g. ['team_member','role']) — mirrors tag.vue's `context`
   * array. The MP must hold the `read:` scope for every kind listed.
   */
  readonly kinds: readonly DirectoryKind[];
  /** Allow multi-select. Default false. */
  readonly multiple?: boolean;
}

/**
 * Host-rendered selection UI. The host opens the app's own picker (in the host
 * realm, permission-scoped to the current user) and returns only the choice.
 * Requires the matching `read:` scope(s); results are double-filtered
 * (MP scope ∩ user visibility) — see host-services.md.
 */
export interface UiApi {
  /** Canonical picker — supports mixed kinds and multi-select. */
  pick(opts: PickOptions): Promise<EntityRef[]>;
  // convenience wrappers — common single-kind cases, thin calls to pick():
  pickTeamMember(opts?: PickerOptions): Promise<EntityRef | null>;
  pickTeamMembers(opts?: PickerOptions): Promise<EntityRef[]>;
  pickLocation(opts?: PickerOptions): Promise<EntityRef | null>;
  pickLocations(opts?: PickerOptions): Promise<EntityRef[]>;
  pickRole(opts?: PickerOptions): Promise<EntityRef | null>;
  pickSkill(opts?: PickerOptions): Promise<EntityRef | null>;
  pickSkills(opts?: PickerOptions): Promise<EntityRef[]>;
  pickTag(opts?: PickerOptions): Promise<EntityRef | null>;
  pickTags(opts?: PickerOptions): Promise<EntityRef[]>;
  /**
   * Show the host-rendered mini-profile quick-look card for a team member or
   * client. Responsive (desktop dropdown / mobile bottom sheet), permission-
   * scoped. Resolves when the card is dismissed. Replaces `onMiniProfileClick`.
   */
  showMiniProfile(ref: { kind: 'team_member' | 'client'; id: string }): Promise<void>;
  /**
   * Transient host-rendered snackbar. Grant-free (exposes no data, cannot reveal
   * anything the user may not see) — no catalogue scope. Resolves once the toast
   * is dismissed/auto-hidden; `actionInvoked` is true when the user tapped the
   * optional action. Replaces every MP's bespoke toast.
   */
  toast(opts: {
    message: string;
    variant?: 'info' | 'success' | 'warning' | 'error';
    durationMs?: number;
    action?: { label: string };
  }): Promise<{ actionInvoked: boolean }>;
  /**
   * Host-rendered modal confirm. Grant-free (no catalogue scope). Resolves true
   * when confirmed, false when cancelled/dismissed. Use before destructive actions.
   */
  confirm(opts: {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }): Promise<boolean>;
}

/** Permission-scoped reference data. Every result is double-filtered by the host. */
export interface DirectoryApi {
  /** id -> EntityRef, or null if the user may not see it. */
  resolve(kind: DirectoryKind, id: string): Promise<EntityRef | null>;
  /** Batch resolve; only permitted entities are returned. */
  resolveMany(kind: DirectoryKind, ids: readonly string[]): Promise<ReadonlyArray<EntityRef>>;
  /** The entities the user+MP may see. Prefer UiApi pickers — list exposes more data. */
  list(
    kind: DirectoryKind,
    query?: { search?: string; limit?: number; cursor?: string },
  ): Promise<{ items: readonly EntityRef[]; nextCursor?: string }>;
}

// ============================================================================
// Device & native capabilities (see host-services.md — host-mediated, never
// called natively by MP code in either mode). Every method passes the triple
// gate: MP scope ∩ device-capability-present ∩ OS permission.
// ============================================================================

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
  readonly format: string;        // e.g. 'qr', 'ean13'
}
export interface Position {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy: number;      // metres
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
  /** Host-mediated photo capture. Returns the artifact, not a MediaStream. */
  capturePhoto(opts?: { camera?: 'front' | 'back' }): Promise<PhotoResult>;
  /** QR / barcode scan via the host scanner UI. */
  scanCode(opts?: { formats?: readonly string[] }): Promise<ScanResult>;
  /** Host-mediated audio recording. */
  recordAudio(opts?: { maxMs?: number }): Promise<AudioResult>;
  /** One-time GPS fix. */
  getLocation(opts?: { highAccuracy?: boolean }): Promise<Position>;
  /** Ongoing GPS. Host shows a persistent indicator; auto-stops on teardown. */
  watchLocation(handler: (p: Position) => void, opts?: { highAccuracy?: boolean }): Unsubscribe;
  /** Current network status. */
  network(): Promise<NetworkStatus>;
  onNetworkChange(handler: (s: NetworkStatus) => void): Unsubscribe;
  /** Native share sheet. */
  share(payload: { title?: string; text?: string; url?: string }): Promise<void>;
  /** Save an image to the device gallery. */
  saveImage(image: Blob): Promise<void>;
  /** Post a local notification. */
  notify(opts: { title: string; body: string }): Promise<void>;
  /** Coarse device info. */
  info(): Promise<DeviceInfo>;
  /**
   * Host-mediated Capacitor kiosk / guided-access lock. Canonicalises the
   * previously-unnamed Time-Clock host call (the old `lock_device` activity was
   * removed). Scope `invoke:device_kiosk`.
   */
  requestKioskMode(opts: { enabled: boolean }): Promise<void>;
}

// ============================================================================
// Platform services — `tommy.host` (see host-services.md; loop-review X4,X5,X8)
// Reference/identity/infrastructure that is NOT a Mini Program: always present,
// versioned, cannot be uninstalled. Exposed as plain reads.
// ============================================================================

export interface HostApi {
  /** Is a platform feature flag enabled for this tenant? (loop-review X8) */
  feature(name: string): Promise<boolean>;
  /** Does the current user hold a permission? Host applies the real RBAC. (X8) */
  permission(name: string): Promise<boolean>;
  /** Public holidays in a range (platform service — not an MP). */
  holidays(range: { startAt: Iso8601; endAt: Iso8601 }): Promise<
    ReadonlyArray<{ date: Iso8601; name: string }>
  >;
  /** Pay-rate templates (platform service). Shape is the payroll contract. */
  payTemplates(query: { teamMemberId?: string }): Promise<ReadonlyArray<unknown>>;
  /** Videos platform service (interim until/unless a Training MP exists):
   *  clock-in videos a team member must watch. First consumer: Time Clock. */
  requiredClockInVideos(teamMemberId: string): Promise<
    ReadonlyArray<{ videoId: string; title: string; watched: boolean }>
  >;
  /** Record that the current user viewed a video (Videos platform service). */
  recordVideoView(args: { videoId: string }): Promise<void>;
  /**
   * Curated-key org config (read-only; settings owned by the host/admin UI).
   * The readable key set is Tommy-curated and versioned — no free-form keys
   * (timezone, week_start, currency, business_hours, rounding, default_location,
   * locale, branding). `tommy.clock.timezone` exposes the timezone slice.
   */
  tenantSetting(
    key: string,
  ): Promise<string | number | boolean | null>;
  /**
   * Integration connection state only (never secrets) for a provider category.
   * Closes the registry §6 unowned edge (timesheets W-EDGE-15 payroll branch).
   */
  integrationSettings(
    category: 'payroll' | 'accounting' | 'payments',
  ): Promise<{
    readonly provider: string;
    readonly connected: boolean;
    readonly capabilities?: readonly string[];
  }>;
  /**
   * Per-provider connection state + opaque ref only; never secrets. Closes the
   * registry §6 unowned edge (invoicing W-EDGE-06 Stripe affordance gate).
   */
  integration(
    provider: string,
  ): Promise<{
    readonly connected: boolean;
    readonly accountRef?: string;
    readonly chargesEnabled?: boolean;
  } | null>;
}

/**
 * `tommy.host.payTemplatesChanged` (TRIGGER) — the change event for the
 * pull-only `payTemplates()` read; closes the registry §6 reactivity gap so
 * scheduling cost estimates (W-EDGE-20) and timesheet hours/cost (W-EDGE-14)
 * do not serve stale rates. Emitted by tommy-api via the inbound platform-emit
 * channel (actions-runtime.md §1). Mirrors `tommy.user.role_changed` /
 * `tommy.billing.plan_changed` / the `tommy.directory.*` entity-event triggers.
 */
export interface PayTemplatesChangedTrigger {
  readonly at: Iso8601;
  readonly teamMemberId?: string;
}

// ============================================================================
// Messaging — `tommy.messaging` (see host-services.md; the Chats platform
// service, backed by tommy-chat-server — a host service, never an MP).
// ============================================================================

export interface MessagingApi {
  /** Reset the current user's chat session (Chats platform service — tommy-chat-server). */
  resetSession(): Promise<void>;
  // NOTE — messaging CONTENT is NOT a platform primitive. Per the 2026-06-14
  // decision (D5 stands), `send_message` and the inbound message triggers
  // (message_received / mention_received / message_read / conversation_created,
  // plus unread_count / conversation_exists) stay owned by the future
  // Team Comms MP (`team-comms.*`), deferred to M5 and dormant per
  // actions-runtime.md §9.6. `resetSession` is the ONLY platform/host messaging
  // primitive. Do not add content methods/triggers here.
}

/**
 * X7 — "act on behalf of". Conditions and Activities that operate on a team
 * member accept an optional `targetTeamMemberId` in their args. When absent,
 * the operation targets the current user. The host enforces the actor
 * permission at the boundary (same double-filter as host-services).
 */
export type WithActor<T> = T & { targetTeamMemberId?: string };

// ============================================================================
// Clock / Scheduler — `tommy.clock` (see platform-primitives.md §2/§3)
// The headline new platform primitive. Formalises the bespoke tommy-api
// scheduled-job server-emit pattern into a first-class, timezone-aware,
// per-tenant scheduled TRIGGER plus authoritative time CONDITIONS.
// ============================================================================

/** IANA timezone identifier, e.g. 'Australia/Sydney'. */
export type IanaTz = string;

/**
 * The Action setting carried in `optionsSchema` for a `tommy.clock.scheduled`
 * trigger — the schedule is the setting (not a fixed payload). Two Actions on
 * one MP may hold different schedules.
 */
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

/** Emitted by `tommy.clock.scheduled`. `occurrenceKey` is stable per fire and doubles as the idempotency seed. */
export interface ClockScheduledTrigger {
  readonly firedAt: Iso8601;
  readonly scheduledFor: Iso8601;
  readonly timezone: IanaTz;
  readonly occurrenceKey: string;
}

/**
 * Emitted by `tommy.clock.relative` (low-priority) — fire N before/after a
 * STATIC self-anchored timestamp. Reactive entity-relative timers stay
 * owner-side (e.g. scheduling's own `set_shift_reminders`).
 */
export interface ClockRelativeTrigger {
  readonly firedAt: Iso8601;
  readonly anchor: Iso8601;
  readonly offsetSec: number;
  readonly occurrenceKey: string;
}

/** `now()` condition return — the authoritative SERVER clock, not the device clock. */
export interface ClockNow {
  readonly instant: Iso8601;
  readonly tenantLocal: Iso8601;
  readonly timezone: IanaTz;
  readonly epochMs: number;
}

/** `timezone()` condition return — the resolved tenant timezone. */
export interface ClockTimezone {
  readonly timezone: IanaTz;
  readonly utcOffsetMinutes: number;
  readonly dstActive: boolean;
}

export interface ClockApi {
  /** Authoritative server clock (uncacheable / ~1s TTL). Non-metered. */
  now(): Promise<ClockNow>;
  /** Resolved tenant timezone (cacheable; invalidated on tenant-settings change). Non-metered. */
  timezone(): Promise<ClockTimezone>;
}

// ============================================================================
// Lifecycle — `tommy.lifecycle` (see platform-primitives.md §2)
// App & connectivity lifecycle triggers. network_online/offline are the
// BUS-trigger form of the same signal as the in-MP `device.onNetworkChange`.
// ============================================================================

/** `tommy.lifecycle.app_resumed` — debounced; supersedes the interim `host.resume`. */
export interface LifecycleAppResumedTrigger {
  readonly resumedAt: Iso8601;
  readonly awayMs?: number;
  readonly coldStart: boolean;
}

/** `tommy.lifecycle.app_backgrounded` — debounced. */
export interface LifecycleAppBackgroundedTrigger {
  readonly backgroundedAt: Iso8601;
}

/** `tommy.lifecycle.network_online` — bus-trigger form of the existing online signal. */
export interface LifecycleNetworkOnlineTrigger {
  readonly at: Iso8601;
  readonly type: NetworkStatus['type'];
}

/** `tommy.lifecycle.network_offline` — bus-trigger form of the existing offline signal. */
export interface LifecycleNetworkOfflineTrigger {
  readonly at: Iso8601;
}

/**
 * Lifecycle namespace marker. These are platform-emitted BUS triggers wired in
 * Actions (subscribe via `tommy.actions.subscribe`), not in-MP callbacks — so
 * `LifecycleApi` carries no methods; the payload types above are the contract.
 *
 * DEFERRED — reserved, NOT built (no concrete consumer; privacy-sensitive):
 * `tommy.lifecycle.mp_opened` / `mp_closed` (cross-MP open/close), scope-gated
 * `read:lifecycle_mp_events` (default-deny). Do not wire.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface LifecycleApi {}

// ============================================================================
// Cross-user notifications — `tommy.notifications` (see platform-primitives.md
// §2/§4). Targets OTHER users via tommy-api `UserPushNotifier` — distinct from
// the LOCAL-only `tommy.device.notify` (self-device toast).
// ============================================================================

/** `tommy.notifications.notification_opened` trigger; scope `read:notifications_events`. */
export interface NotificationOpenedTrigger {
  readonly notificationId: string;
  readonly channel: 'push' | 'inapp';
  readonly openedBy: string;
  readonly openedAt: Iso8601;
  readonly deepLink?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface NotificationsApi {
  /**
   * Push notification to OTHER users (tommy-api `server_write`, `UserPushNotifier`).
   * Scope `invoke:notifications_push`.
   */
  send_push(args: {
    to: string | readonly string[];
    title: string;
    body: string;
    data?: Readonly<Record<string, unknown>>;
    badge?: number;
    deepLink?: string;
  }): Promise<{ notificationId: string; deliveredDeviceCount: number }>;
  /**
   * Persistent in-app bell/inbox notification to OTHER users (tommy-api notifier).
   * Scope `invoke:notifications_inapp`.
   */
  send_inapp_notification(args: {
    to: string | readonly string[];
    title: string;
    body: string;
    category?: string;
    deepLink?: string;
    level?: 'info' | 'success' | 'warning' | 'error';
  }): Promise<{ notificationId: string }>;

  // DEFERRED — reserved behind a flag, NOT wired (no current MP demand):
  //   send_email({ to, subject, body, templateId?, templateData? })
  //     -> { messageId }; scope `invoke:notifications_email`.
  //   send_sms({ to, body }) -> { messageId, segmentCount };
  //     scope `invoke:notifications_sms`; DUAL-METERED (Actions unit + :sms meter).
  // SMS's one concrete demand (scheduling.send_booking_confirmation) is already
  // Scheduling-owned; do not ship a general send_sms in the first cut.
}

// ============================================================================
// Identity, auth & RBAC — `tommy.session` / `tommy.user`
// (see platform-primitives.md §2). who-am-I reads + identity/role events.
// ============================================================================

/** Minimal session identity — NOT the full user graph (audit 1.8). */
export interface SessionUser {
  readonly userId: string;
  readonly teamMemberId?: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly isKioskActor: boolean;
}

/** `tommy.session.user_logged_in` trigger payload. */
export interface SessionUserLoggedInTrigger {
  readonly userId: string;
  readonly teamMemberId?: string;
  readonly at: Iso8601;
  readonly method: string;
  readonly isKioskActor: boolean;
}

/** `tommy.session.user_logged_out` trigger payload. */
export interface SessionUserLoggedOutTrigger {
  readonly userId: string;
  readonly teamMemberId?: string;
  readonly at: Iso8601;
  readonly reason: string;
}

/** `tommy.session.active_user_changed` — kiosk PIN actor switch (no full logout). */
export interface SessionActiveUserChangedTrigger {
  readonly previousTeamMemberId?: string;
  readonly activeTeamMemberId: string;
  readonly at: Iso8601;
  readonly via: string;
}

/** `tommy.user.role_changed` — doubles as the cache-invalidation signal for cached role/permission reads. */
export interface UserRoleChangedTrigger {
  readonly teamMemberId: string;
  readonly addedRoles: readonly string[];
  readonly removedRoles: readonly string[];
  readonly at: Iso8601;
  readonly changedBy?: string;
}

/** who-am-I reads. The login/logout/actor-switch/role-change events ride the bus (types above). */
export interface SessionApi {
  /** Minimal current session identity, or null when unauthenticated. */
  current_user(): Promise<SessionUser | null>;
  /** Current user's roles + primary role. */
  current_role(): Promise<{ roles: readonly string[]; primaryRole?: string }>;
  /** Is there an authenticated session? Gate user-scoped reads pre-login. */
  is_authenticated(): Promise<boolean>;
}

/**
 * `tommy.user.*` — RBAC events namespace. `role_changed` is a platform-emitted
 * BUS trigger (payload `UserRoleChangedTrigger`), not a read; no methods.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UserApi {}

// ============================================================================
// Directory entity-event triggers — `tommy.directory.*`
// (see platform-primitives.md §2). REF-ONLY: payloads carry ids (+ changedFields),
// NEVER records; per-subscriber double-filtered; subscriber re-resolves via
// `tommy.directory.resolve`. Preserves the audit-1.8 guarantee.
// ============================================================================

/** `tommy.directory.team_member_added`. */
export interface DirectoryTeamMemberAddedTrigger {
  readonly teamMemberId: string;
  readonly at: Iso8601;
}

/** `tommy.directory.team_member_updated` — debounce candidate. */
export interface DirectoryTeamMemberUpdatedTrigger {
  readonly teamMemberId: string;
  readonly changedFields: readonly string[];
  readonly at: Iso8601;
}

/** `tommy.directory.team_member_deactivated`. */
export interface DirectoryTeamMemberDeactivatedTrigger {
  readonly teamMemberId: string;
  readonly at: Iso8601;
  readonly effectiveAt?: Iso8601;
}

/** `tommy.directory.client_added` — ref-only. */
export interface DirectoryClientAddedTrigger {
  readonly clientId: string;
  readonly at: Iso8601;
}

/** `tommy.directory.client_updated` — debounce candidate. */
export interface DirectoryClientUpdatedTrigger {
  readonly clientId: string;
  readonly changedFields: readonly string[];
  readonly at: Iso8601;
}

/**
 * `tommy.directory.entity_changed` — ONE consolidated trigger for the
 * low-cardinality tag-family kinds (location/role/tag), to avoid primitive sprawl.
 */
export interface DirectoryEntityChangedTrigger {
  readonly kind: 'location' | 'role' | 'tag';
  readonly entityId: string;
  readonly change: 'added' | 'updated' | 'removed';
  readonly at: Iso8601;
}

// ============================================================================
// Billing — `tommy.billing` (see platform-primitives.md §2)
// Actions usage READ + allowance / over-allowance / plan-change triggers.
// ============================================================================

/** `tommy.billing.actions_usage` condition return. */
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

/** `tommy.billing.actions_allowance_warning` — 80%/90% cross. Self-reference metering-exempt. */
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

/** `tommy.billing.actions_over_allowance` — first crossing. Self-reference metering-exempt. */
export interface BillingOverAllowanceTrigger {
  readonly tenantId: string;
  readonly periodStart: Iso8601;
  readonly periodEnd: Iso8601;
  readonly overageUnits: number;
  readonly hardCapEnabled: boolean;
  readonly coverage: string;
}

/** `tommy.billing.plan_changed`. */
export interface BillingPlanChangedTrigger {
  readonly tenantId: string;
  readonly previousPlanId: string;
  readonly newPlanId: string;
  readonly previousAllowance?: number;
  readonly newAllowance?: number;
  readonly effectiveAt: Iso8601;
  readonly reason: string;
}

/** Actions-usage read. Allowance/over-allowance/plan-change events ride the bus (types above). */
export interface BillingApi {
  /** Current-period Actions usage for this tenant. Non-metered read. */
  actions_usage(args?: { tenantId?: string }): Promise<BillingActionsUsage>;

  // DEFERRED — reserved, NOT wired (weakest demand; plan_changed covers every
  // demonstrated need): `tommy.billing.subscription_status_changed`
  //   -> { tenantId, previousStatus, newStatus, effectiveAt, gracePeriodEndsAt? }.
}

// ============================================================================
// Actions-meta triggers — `tommy.actions.*` (see platform-primitives.md §2)
// Read from the existing action-run record; meta-triggers carry a re-entrancy
// guard + debounce/coalesce.
// ============================================================================

/** `tommy.actions.action_dead_lettered` — high-value, low-frequency alerting. */
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

// DEFERRED — reserved, NOT wired (noisy; needs mandatory-debounce + default-disabled
// and a concrete consumer): `tommy.actions.action_failed`
//   -> { ...errorCode, retryable, attempts, willRetry, failedAt }.

// ============================================================================
// Offline-sync triggers — `tommy.sync.*` (see platform-primitives.md §2;
// offline-sync.md §3/§5). sync_completed = queue drained; conflict_detected =
// a specific conflict, OBSERVE-ONLY (these report outcomes; they do not resolve).
// ============================================================================

/** `tommy.sync.sync_completed` — broker finished draining the offline trigger queue. */
export interface SyncCompletedTrigger {
  readonly completedAt: Iso8601;
  readonly drainedCount: number;
  readonly conflictsResolved: number;
  readonly failedCount: number;
  readonly mpId?: MpId;
}

/** `tommy.sync.conflict_detected` — OBSERVE-ONLY; the merge stays the MP's customResolverActivity. */
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

// ============================================================================
// DEFERRED platform primitives — reserved names only, NOT wired into any live
// API surface (see platform-primitives.md §5 residuals). Build when a concrete
// consumer appears.
// ============================================================================

/**
 * DEFERRED — `tommy.location.*` geofence triggers. A full audit found ZERO
 * current demand and outsized cost (stateful host geofence engine, per-tenant
 * fence config, battery/privacy). `tommy.device.getLocation` covers today's
 * real demand. Reserved; do NOT build until a concrete auto-clock-in MP lands.
 *
 * Reserved payload shape (both `geofence_entered` / `geofence_exited`):
 *   { teamMemberId, locationId, fenceId, at, position }
 *   scope `read:location_geofence` (default-deny).
 */
// (Type intentionally not declared on the live surface — name reserved in prose.)

// ============================================================================
// Cross-MP launch — `tommy.navigation` (see host-services.md)
// Opening another MP's UI (a form, a page). Host-mediated — the caller never
// touches the target MP's realm. Not an Activity (Activities are headless).
// ============================================================================

export interface OpenTarget {
  readonly mpId: MpId;
  /** A route the target MP declares in its manifest `contributions` (public only). */
  readonly route: string;
  readonly params?: Readonly<Record<string, string>>;
  /** Present as a full page or a modal layer. Default 'page'. */
  readonly mode?: 'page' | 'modal';
}

export interface OpenResult<R = unknown> {
  /** True if the launched flow finished; false if the user cancelled/dismissed. */
  readonly completed: boolean;
  /** Whatever the launched MP returned via `complete()` — e.g. a new record id. */
  readonly result?: R;
}

export interface NavigationApi {
  /** Open another MP's contributed surface; resolves when that flow closes. */
  open<R = unknown>(target: OpenTarget): Promise<OpenResult<R>>;
  /** Called by the launched MP to finish the flow and return a result. */
  complete(result?: unknown): void;
  /** Is a target MP installed + enabled for this tenant? Gate the affordance on it. */
  canOpen(mpId: MpId): Promise<boolean>;
}

// ============================================================================
// Root SDK object — `tommy`
// ============================================================================

export interface TommySdk {
  readonly init: MpInit;
  readonly actions: ActionsApi;
  readonly panels: PanelsApi;
  readonly data: DataApi;
  /** Host-rendered pickers (team member, location, role, skill, tag). */
  readonly ui: UiApi;
  /** Permission-scoped reference data. */
  readonly directory: DirectoryApi;
  /** Host-mediated device & native capabilities (camera, GPS, scan, …). */
  readonly device: DeviceApi;
  /** Current theme + change subscription (Day/Night/System). */
  readonly theme: ThemeApi;
  /** Platform services — feature/permission gates + reference data. */
  readonly host: HostApi;
  /** Cross-MP launch — open another MP's UI and optionally await a result. */
  readonly navigation: NavigationApi;
  /** Chats platform service (tommy-chat-server) — host-mediated session reset only (D5). */
  readonly messaging: MessagingApi;
  /** Clock / Scheduler — authoritative server time reads (the scheduled trigger is wired in Actions). */
  readonly clock: ClockApi;
  /** App & connectivity lifecycle — bus triggers (payload types) wired via `actions.subscribe`. */
  readonly lifecycle: LifecycleApi;
  /** Cross-user notifications (push / in-app) to OTHER users — distinct from local `device.notify`. */
  readonly notifications: NotificationsApi;
  /** who-am-I reads (current_user / current_role / is_authenticated). */
  readonly session: SessionApi;
  /** RBAC events namespace (`role_changed` rides the bus). */
  readonly user: UserApi;
  /** Actions usage read; allowance/over-allowance/plan-change events ride the bus. */
  readonly billing: BillingApi;
  readonly log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, extra?: unknown) => void;
  /** i18n bound to this MP's bundled locales (not the shared window.i18n). */
  readonly t: (key: string, fallback: string, vars?: Record<string, unknown>) => string;
  /**
   * Unknown-method guard. Accessing a non-existent SDK method throws a
   * TommySDKError with a "did you mean" suggestion (Phase 5.3) rather than
   * returning undefined — critical for AI authors.
   */
}

declare global {
  // eslint-disable-next-line no-var
  var tommy: TommySdk;
}
