// GENERATED from manifest-schema.json by scripts/embed-assets.mjs — do not hand-edit.
// Embedded as a JS module so the package loads in BOTH node (the CLI)
// and the browser/vite pipeline (the M1 in-process loader) without fs
// or JSON import attributes.
export default {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schema.tommy.app/mini-program/manifest/v1.json",
  "title": "Tommy Mini Program Manifest",
  "description": "Schema for a Tommy Mini Program manifest. Authored as YAML (manifest.yml); this JSON Schema validates the parsed object. Every contract is a JSON Schema so AI-authored Mini Programs are first-class.",
  "type": "object",
  "additionalProperties": false,
  "required": ["manifestVersion", "id", "version", "name", "publisher", "category"],
  "properties": {
    "manifestVersion": {
      "description": "Manifest format version. Bump only on breaking format changes.",
      "const": "1"
    },
    "id": {
      "description": "Stable, globally unique, DNS-safe id. In sandboxed mode it becomes the MP subdomain mp-{id}.mp.tommy.app (execution-modes.md); DNS-safety is required of every MP so any MP can flip into the sandbox. Immutable once published.",
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]{1,38}[a-z0-9]$"
    },
    "version": {
      "description": "Semantic version of this MP build.",
      "type": "string",
      "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z-.]+)?(?:\\+[0-9A-Za-z-.]+)?$"
    },
    "name": { "type": "string", "minLength": 1, "maxLength": 60 },
    "category": { "$ref": "#/$defs/category" },
    "description": { "type": "string", "minLength": 1, "maxLength": 280 },
    "icon": {
      "description": "Path, relative to the bundle root, to the MP icon (square, >=256px).",
      "type": "string",
      "pattern": "^[^/].*\\.(png|svg)$"
    },
    "publisher": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "name", "type"],
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
        "name": { "type": "string", "minLength": 1 },
        "type": {
          "description": "Trust tier of the publisher. Sets the review path AND execution-mode eligibility (see execution-modes.md): 'first_party' distributed through Tommy's pipeline may run in-process; every other type runs sandboxed, mandatorily. 'ai_authored' is treated as 'unknown' regardless of who prompted.",
          "enum": ["first_party", "verified_third_party", "unknown", "ai_authored"]
        },
        "homepage": { "type": "string", "format": "uri" }
      }
    },
    "locales": {
      "description": "BCP-47 locale tags the MP ships translations for. First entry is the fallback.",
      "type": "array",
      "minItems": 1,
      "items": { "type": "string", "pattern": "^[a-z]{2}(-[A-Z]{2})?$" }
    },

    "permissions": {
      "description": "Capability-based permission model. The MP receives a token bound to exactly these scopes; the host enforces them at the sandbox boundary.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "scopes": {
          "description": "Declared capability scopes. Format verb:resource. Default-deny: anything not listed is unreachable.",
          "type": "array",
          "uniqueItems": true,
          "items": {
            "type": "string",
            "pattern": "^(read|write|invoke):[a-z][a-z0-9_]*$"
          }
        },
        "roles": {
          "description": "Install-time RBAC: which tenant roles may use this MP. Maps to the existing Tommy role model.",
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },

    "network": {
      "description": "Network egress allowlist. Enforced by the per-MP CSP connect-src. Default is none.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "egress": {
          "type": "array",
          "default": [],
          "uniqueItems": true,
          "items": {
            "type": "string",
            "description": "Exact host (no scheme, no path). Wildcards not allowed.",
            "pattern": "^[a-z0-9.-]+\\.[a-z]{2,}$"
          }
        }
      }
    },

    "triggers": {
      "description": "Events this MP emits onto the Actions bus. Async fan-out by default.",
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "additionalProperties": false,
        "required": ["description", "payloadSchema", "emission"],
        "properties": {
          "description": { "type": "string" },
          "payloadSchema": {
            "description": "JSON Schema for the trigger payload. Validated at emit time.",
            "$ref": "#/$defs/jsonSchema"
          },
          "emission": { "enum": ["sync", "async", "debounced"] },
          "debounceMs": { "type": "integer", "minimum": 0, "maximum": 60000 },
          "contractVersion": { "$ref": "#/$defs/contractVersion" },
          "deprecated": { "$ref": "#/$defs/deprecatedMarker" }
        },
        "allOf": [
          {
            "if": { "properties": { "emission": { "const": "debounced" } } },
            "then": { "required": ["debounceMs"] }
          }
        ]
      }
    },

    "conditions": {
      "description": "Synchronous-style queries other MPs may evaluate against this MP. Pure, side-effect-free.",
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "additionalProperties": false,
        "required": ["description", "inputSchema", "returnSchema", "latencyBudgetMs"],
        "properties": {
          "description": { "type": "string" },
          "inputSchema": { "$ref": "#/$defs/jsonSchema" },
          "returnSchema": { "$ref": "#/$defs/jsonSchema" },
          "latencyBudgetMs": {
            "description": "Max evaluation time. Exceeding it is a timeout (see actions-runtime.md).",
            "type": "integer", "minimum": 1, "maximum": 5000
          },
          "cacheable": { "type": "boolean", "default": false },
          "cacheTtlMs": { "type": "integer", "minimum": 0 },
          "contractVersion": { "$ref": "#/$defs/contractVersion" },
          "deprecated": { "$ref": "#/$defs/deprecatedMarker" }
        }
      }
    },

    "activities": {
      "description": "Side-effecting operations other MPs may invoke against this MP.",
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "additionalProperties": false,
        "required": ["description", "inputSchema", "sideEffect", "idempotency", "offlineReplayable"],
        "properties": {
          "description": { "type": "string" },
          "inputSchema": { "$ref": "#/$defs/jsonSchema" },
          "resultSchema": { "$ref": "#/$defs/jsonSchema" },
          "sideEffect": {
            "description": "Declared effect class. Must match static analysis at review time.",
            "enum": ["local_write", "server_write", "external_call"]
          },
          "idempotency": {
            "description": "How an idempotency key is formed so retries/replays are safe.",
            "enum": ["client_key", "derived_from_input", "natural_key", "none"]
          },
          "offlineReplayable": {
            "description": "If true, the invocation can be queued offline and replayed on reconnect.",
            "type": "boolean"
          },
          "retry": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "maxAttempts": { "type": "integer", "minimum": 0, "maximum": 10 },
              "backoff": { "enum": ["none", "linear", "exponential"] }
            }
          },
          "authorizedCallers": {
            "description": "MP ids permitted to invoke this activity. Default-deny: empty/absent means first-party + same-MP only.",
            "type": "array",
            "items": { "type": "string" }
          },
          "permission": {
            "description": "Tenant permission name gating the underlying domain write (the existing custom authorize! system, NOT a token scope). REQUIRED by tommy-api's fail-closed floor for any server_write activity backed by a registered server executor: the executor refuses a privileged write whose manifest declares no permission (InvokeExecutor hardening 2026-07-11; the v1.1 J1 fixtures carry 'timesheet_access').",
            "type": "string"
          },
          "contractVersion": { "$ref": "#/$defs/contractVersion" },
          "deprecated": { "$ref": "#/$defs/deprecatedMarker" }
        },
        "allOf": [
          {
            "if": { "properties": { "idempotency": { "const": "none" }, "offlineReplayable": { "const": true } } },
            "then": false,
            "$comment": "An offline-replayable activity MUST have an idempotency strategy."
          }
        ]
      }
    },

    "actions": {
      "description": "Declarative trigger->(condition)->activity wiring — the IFTTT-style rules the MP proposes. Inter-MP behaviour that is hard-coded today becomes a configurable Action here, so it can be enabled/disabled and customised per tenant. Analysed by review check C15 for loops/amplification.",
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "additionalProperties": false,
        "required": ["title", "trigger", "activity", "enabledByDefault", "required", "userConfigurable"],
        "properties": {
          "title": { "type": "string" },
          "description": { "type": "string" },
          "trigger": {
            "description": "The trigger that fires this Action.",
            "type": "object",
            "additionalProperties": false,
            "required": ["name"],
            "properties": {
              "mp": { "type": "string", "description": "Source owning the trigger. Defaults to this MP. A cross-MP source requires that MP to be installed. MAY be a 'tommy.*' platform namespace (e.g. 'tommy.clock' with name 'scheduled') to subscribe to a system-supplied platform trigger from platform-primitives.md — platform sources are treated as ALWAYS-PRESENT by the §9.6 derived dependency set (never a missing dependency, never a hidden Action)." },
              "name": { "type": "string" },
              "debounceMs": {
                "description": "Optional subscriber-side debounce/dwell (ms) the broker coalesces against before firing this Action. Reuses the same emission-debounce convention as MP-owned 'debounced' triggers. Required by review check C15 when wiring a high-frequency platform trigger (e.g. tommy.clock.scheduled, tommy.session.active_user_changed) whose underlying trigger is not already debounced.",
                "type": "integer",
                "minimum": 0,
                "maximum": 60000
              }
            }
          },
          "conditions": {
            "description": "Optional gates evaluated before the activity runs. All must pass. Per 2.22 E1 a condition may be PARAMETERIZED via 'input' (mapped from trigger/option/const or an EARLIER-listed condition's return — DAG order, cycles rejected by the validator) and aliased via 'ref' so one condition can be evaluated twice with different inputs.",
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["name"],
              "properties": {
                "ref": { "type": "string", "description": "Local alias for this evaluation (defaults to 'name'). inputMap/predicate sources reference it." },
                "mp": { "type": "string", "description": "Source owning the condition. Defaults to this MP. MAY be a 'tommy.*' platform namespace (e.g. 'tommy.host' with name 'tenantSetting', or 'tommy.session' with name 'current_user') for a system-supplied platform condition — platform sources are ALWAYS-PRESENT for the §9.6 dependency set." },
                "name": { "type": "string" },
                "input": {
                  "description": "2.22 E1 — mapped condition inputs, validated against the condition's inputSchema before evaluation. Sources: trigger/option/const/earlier condition.",
                  "type": "object",
                  "additionalProperties": { "$ref": "#/$defs/inputMapSource" }
                },
                "args": { "type": "object", "description": "Static literal args (pre-E1 form). Prefer 'input' for anything mapped; 'args' remains valid for pure literals." }
              }
            }
          },
          "activity": {
            "description": "The activity invoked when the trigger fires and conditions pass. THREE forms (2.22): a single target; a 'select' branch list (E4 — ordered, first-match-wins over closed predicates, REQUIRED terminal else — the validator enforces last-entry-is-else); or a 'computed' Computed-Action function reference (the declared functions: entry runs server-side in the AFR and returns the intent envelope — 2.22 §4).",
            "oneOf": [
              {
                "type": "object",
                "additionalProperties": false,
                "required": ["name"],
                "properties": {
                  "mp": { "type": "string", "description": "Source owning the activity. Defaults to this MP. MAY be a 'tommy.*' platform namespace (e.g. 'tommy.notifications' with name 'send_push', 'tommy.ui' with name 'navigate', or 'tommy.device' with name 'requestKioskMode') for a system-supplied platform activity — platform sources are ALWAYS-PRESENT for the §9.6 dependency set. Note: messaging content (send_message and inbound message triggers) is NOT platform; it is Team Comms MP-owned (team-comms.*), deferred to M5 (D5 stands). The only platform messaging primitive is tommy.messaging.resetSession." },
                  "name": { "type": "string" },
                  "inputMap": {
                    "description": "Declarative, non-Turing-complete arg assembly: each target activity-input field maps from exactly one source (trigger payload / a listed condition or serviceRead return / an option / a const / a template / the forEach item), optionally through a closed transform chain (2.22 E2, max 8 steps). The broker assembles and validates args against the activity inputSchema. See actions-runtime.md §9.7 + 2.22 §2.",
                    "type": "object",
                    "additionalProperties": { "$ref": "#/$defs/inputMapSource" }
                  }
                }
              },
              {
                "type": "object",
                "additionalProperties": false,
                "required": ["select"],
                "properties": {
                  "select": {
                    "description": "2.22 E4 — ordered branch list; first matching 'when' wins; the LAST entry MUST be the else branch (validator-enforced). Every branch's target joins the dependency set, authorization, and 2.21 consumer expectations whether or not it fired.",
                    "type": "array",
                    "minItems": 2,
                    "items": { "$ref": "#/$defs/selectBranch" }
                  }
                }
              },
              {
                "type": "object",
                "additionalProperties": false,
                "required": ["computed"],
                "properties": {
                  "computed": {
                    "description": "2.22 §4 — the name of a functions: entry in THIS manifest. The function executes server-side (AFR), receives the trigger payload + this Action's declared condition/serviceRead returns + options, and returns the activity-invoke envelope the executor validates and dispatches.",
                    "type": "string",
                    "pattern": "^[a-z][a-z0-9_]*$"
                  }
                }
              }
            ]
          },
          "forEach": {
            "description": "2.22 E5 — bounded fan-out: evaluate the activity once per element of a condition/serviceRead-returned collection. 'item' becomes a valid inputMap source. Truncation at maxItems is recorded on the action-run; C15 flags unbounded sources; metered as ONE execution.",
            "type": "object",
            "additionalProperties": false,
            "required": ["from", "maxItems"],
            "properties": {
              "from": { "$ref": "#/$defs/inputMapSource" },
              "maxItems": { "type": "integer", "minimum": 1, "maximum": 100 }
            }
          },
          "serviceReads": {
            "description": "2.22 E6 — host service-reads (tommy.* SR primitives, e.g. tommy.directory.resolve) declared as wiring sources, evaluated under the installer-tenant's existing leases/grants and joining the Action's dependency/authz surface.",
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["ref", "name"],
              "properties": {
                "ref": { "type": "string" },
                "name": { "type": "string", "pattern": "^tommy\\.[a-z][a-z0-9.]*[a-zA-Z0-9]$" },
                "input": {
                  "type": "object",
                  "additionalProperties": { "$ref": "#/$defs/inputMapSource" }
                }
              }
            }
          },
          "interaction": {
            "description": "2.22 §2.7 — interaction-level guards for this Action.",
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "confirm": {
                "description": "The declarative confirm guard: the host renders tommy.ui.confirm BEFORE dispatch; decline = a typed skip recorded on the action-run. 'message' follows the E3 template rules (plain text only, placeholders + transform pipes).",
                "type": "object",
                "additionalProperties": false,
                "required": ["title", "message"],
                "properties": {
                  "title": { "type": "string", "maxLength": 80 },
                  "message": { "type": "string", "maxLength": 500 },
                  "confirmLabel": { "type": "string", "maxLength": 40 },
                  "destructive": { "type": "boolean", "default": false }
                }
              }
            }
          },
          "optionsSchema": {
            "description": "JSON Schema for the Action's user-editable options (e.g. parameter mappings, thresholds). Powers the Action settings UI. MP-defined and not hard-encoded here. Convention: when the trigger is tommy.clock.scheduled, this optionsSchema carries the schedule config { schedule: {kind:'cron',cron,timezone} | {kind:'at',at,recurrence?}, jitterSec?, catchUpPolicy?:'skip'|'fire_once' } (schedule-as-setting; see manifest-schema.md and platform-primitives.md §3). The @tommy/manifest validator enforces the canonical shape for clock-triggered Actions.",
            "$ref": "#/$defs/jsonSchema"
          },
          "optionsDefault": {
            "description": "Default values for the Action's options.",
            "type": "object"
          },
          "enabledByDefault": {
            "description": "Whether the Action is active when the MP is installed. Ignored when 'required' is true — a required Action is always enabled.",
            "type": "boolean"
          },
          "required": {
            "description": "If true, the MP needs this Action to function: it is always enabled, the user cannot disable it, and if it cannot run (e.g. its target MP is not installed) the MP itself will not run.",
            "type": "boolean"
          },
          "userConfigurable": {
            "description": "If true, a tenant admin may edit the Action's options and — when not 'required' — enable/disable it. If false the Action is locked: the MP controls it and the user cannot change it.",
            "type": "boolean"
          }
        }
      }
    },

    "panels": {
      "description": "Dashboard / detail-surface panels this MP contributes.",
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "name", "surfaces", "size"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
          "name": { "type": "string", "maxLength": 48 },
          "description": { "type": "string", "maxLength": 200 },
          "icon": { "type": "string" },
          "surfaces": {
            "type": "array",
            "minItems": 1,
            "items": { "$ref": "#/$defs/surface" }
          },
          "size": {
            "description": "Grid units (host grid is 12 columns; rows are fixed-height).",
            "type": "object",
            "additionalProperties": false,
            "required": ["defaultW", "defaultH"],
            "properties": {
              "defaultW": { "type": "integer", "minimum": 1, "maximum": 12 },
              "defaultH": { "type": "integer", "minimum": 1, "maximum": 12 },
              "minW": { "type": "integer", "minimum": 1, "maximum": 12 },
              "minH": { "type": "integer", "minimum": 1, "maximum": 12 },
              "maxW": { "type": "integer", "minimum": 1, "maximum": 12 },
              "maxH": { "type": "integer", "minimum": 1, "maximum": 12 }
            }
          },
          "dataRequirements": {
            "description": "Which conditions/scopes this panel needs to render. Used by the review pipeline's permission-minimality check.",
            "type": "array",
            "items": { "type": "string" }
          },
          "refresh": {
            "type": "object",
            "additionalProperties": false,
            "required": ["policy"],
            "properties": {
              "policy": { "enum": ["manual", "interval", "on_trigger"] },
              "intervalMs": { "type": "integer", "minimum": 5000 },
              "trigger": { "type": "string" }
            }
          },
          "rbac": {
            "type": "object",
            "additionalProperties": false,
            "properties": { "roles": { "type": "array", "items": { "type": "string" } } }
          },
          "configSchema": {
            "description": "JSON Schema for per-tenant panel config. Powers the panel settings UI.",
            "$ref": "#/$defs/jsonSchema"
          },
          "placement": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "defaultSurface": { "$ref": "#/$defs/surface" },
              "order": { "type": "integer" }
            }
          },
          "offline": {
            "description": "How the panel behaves with no connectivity.",
            "enum": ["cached_stale", "needs_connection"]
          }
        }
      }
    },

    "contributions": {
      "description": "Non-panel UI surfaces. Forward-looking; slashCommands reserved.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "routes": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "path", "name"],
            "properties": {
              "id": { "type": "string" },
              "path": { "type": "string", "pattern": "^/[a-zA-Z0-9/:_-]*$", "description": "Canonical route path. May carry :params (e.g. /care-plans/:id/details/)." },
              "name": { "type": "string" },
              "index": { "type": "boolean", "default": false },
              "master": { "type": "boolean", "default": false, "description": "Marks a master route of a master-detail pair (host emits F7 master:true + detailRoutes)." },
              "detail": { "type": "boolean", "default": false, "description": "Marks a detail route paired to a master via masterId." },
              "masterId": { "type": "string", "description": "On a detail route: the id of the master route it belongs to." }
            }
          }
        },
        "modals": { "type": "array", "items": { "$ref": "#/$defs/namedContribution" } },
        "settingsPages": { "type": "array", "items": { "$ref": "#/$defs/namedContribution" } },
        "interactions": {
          "description": "2.22 E7 (D20) — declared interaction points: SDK-rendered affordances that emit the MP-owned trigger '<mpId>.ui.<id>' with ZERO MP code. Payload binds ONLY from the declared view context (route params / declared panel bindings — no DOM scraping; free-form listeners are forbidden). visibleWhen gates VISIBILITY only, never authority (the 2.20 L3 rule). hideWhenUnwired (default true, D21): an interaction with no enabled consuming Action is not rendered.",
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "kind", "surface", "label", "payload"],
            "properties": {
              "id": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
              "kind": { "enum": ["button", "menu_item", "list_row_action", "fab", "link"] },
              "surface": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "route": { "type": "string", "description": "A contributions.routes path (may carry :params)." },
                  "panel": { "type": "string", "description": "A panels[].id." }
                },
                "oneOf": [ { "required": ["route"] }, { "required": ["panel"] } ]
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "required": ["key"],
                "properties": { "key": { "type": "string", "description": "tommy.t locale key." } }
              },
              "icon": { "type": "string" },
              "payload": {
                "description": "Fields the emitted trigger carries, each bound from the declared view context.",
                "type": "object",
                "additionalProperties": {
                  "type": "object",
                  "additionalProperties": false,
                  "oneOf": [ { "required": ["from", "param"] }, { "required": ["from", "path"] }, { "required": ["const"] } ],
                  "properties": {
                    "from": { "enum": ["route", "context"] },
                    "param": { "type": "string", "description": "from: route — the route :param name." },
                    "path": { "type": "string", "description": "from: context — a dotted path into the surface's declared data bindings." },
                    "const": {}
                  }
                }
              },
              "visibleWhen": { "$ref": "#/$defs/predicate" },
              "hideWhenUnwired": { "type": "boolean", "default": true }
            }
          }
        },
        "slashCommands": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["command", "description"],
            "properties": {
              "command": { "type": "string", "pattern": "^/[a-z][a-z0-9-]*$" },
              "description": { "type": "string" }
            }
          }
        }
      }
    },

    "localData": {
      "description": "Object stores this MP persists in its per-MP IndexedDB database.",
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "additionalProperties": false,
        "required": ["keyPath", "recordSchema", "syncStrategy"],
        "properties": {
          "keyPath": { "type": "string" },
          "recordSchema": { "$ref": "#/$defs/jsonSchema" },
          "indexes": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["name", "keyPath"],
              "properties": {
                "name": { "type": "string" },
                "keyPath": { "type": "string" },
                "unique": { "type": "boolean", "default": false }
              }
            }
          },
          "syncStrategy": { "enum": ["server_authoritative", "last_write_wins", "custom"] },
          "customResolverActivity": {
            "description": "Required when syncStrategy is 'custom': the activity that resolves a conflict.",
            "type": "string"
          }
        },
        "allOf": [
          {
            "if": { "properties": { "syncStrategy": { "const": "custom" } } },
            "then": { "required": ["customResolverActivity"] }
          }
        ]
      }
    },

    "functions": {
      "description": "2.22 §4 (D19) — Computed Action functions: the custom-code escape hatch, packaged INSIDE this reviewed artifact and executed SERVER-SIDE in the Action Function Runtime (pure compute; no I/O; inputs assembled by the platform; returns the intent envelope the executor validates and dispatches). Each entry is a PrimitiveContract row (2.21). C20 flags functions expressible under the declarative grammar.",
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "additionalProperties": false,
        "required": ["entry", "runtime", "description", "resultSchema", "timeoutMs", "memoryMb", "reads", "targets"],
        "properties": {
          "entry": { "type": "string", "pattern": "^functions/[A-Za-z0-9._/-]+\\.(js|ts)$" },
          "runtime": { "enum": ["afr-js@1"] },
          "description": { "type": "string" },
          "inputSchema": { "$ref": "#/$defs/jsonSchema" },
          "resultSchema": { "$ref": "#/$defs/jsonSchema" },
          "timeoutMs": { "type": "integer", "minimum": 50, "maximum": 5000 },
          "memoryMb": { "type": "integer", "minimum": 16, "maximum": 128 },
          "reads": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "conditions": { "type": "array", "items": { "type": "string" } },
              "serviceReads": { "type": "array", "items": { "type": "string", "pattern": "^tommy\\." } }
            }
          },
          "targets": {
            "type": "object",
            "additionalProperties": false,
            "required": ["activities"],
            "properties": {
              "activities": { "type": "array", "minItems": 1, "items": { "type": "string" } }
            }
          },
          "contractVersion": { "$ref": "#/$defs/contractVersion" },
          "deprecated": { "$ref": "#/$defs/deprecatedMarker" }
        }
      }
    },

    "deprecations": {
      "description": "2.21 §2/§11 (D17) — deprecation declarations for primitives this version retains-but-sunsets. A removal MUST be covered here (C18 fails closed on undeclared breaks).",
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["primitive", "since", "reason"],
        "properties": {
          "primitive": { "type": "string" },
          "replacedBy": { "type": "string" },
          "since": { "type": "string", "description": "MP version the deprecation was published in." },
          "sunsetAfter": { "type": "string" },
          "migration": { "description": "inputMap-grammar migration hint for consumers (actions-runtime.md §9.7).", "type": "object" },
          "reason": { "type": "string" }
        }
      }
    },

    "removalPlan": {
      "description": "2.21 §2 (D17) — required when this version REMOVES a previously-active primitive. deprecationWindowDays >= the 30d platform floor (hard outer bound 180d).",
      "type": "object",
      "additionalProperties": false,
      "required": ["removedPrimitives", "reason", "deprecationWindowDays"],
      "properties": {
        "removedPrimitives": { "type": "array", "minItems": 1, "items": { "type": "string" } },
        "reason": { "type": "string" },
        "replacement": { "type": "string" },
        "deprecationWindowDays": { "type": "integer", "minimum": 30, "maximum": 180 }
      }
    },

    "review": {
      "description": "Metadata consumed by the Mini Program Review Pipeline (Phase 4).",
      "type": "object",
      "additionalProperties": false,
      "required": ["thirdPartyScripts"],
      "properties": {
        "declaredCapabilities": {
          "type": "array",
          "items": { "type": "string" }
        },
        "thirdPartyScripts": {
          "description": "External scripts the MP loads. MUST be [] or an explicit list; review rejects undeclared ones.",
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["url", "purpose", "integrity"],
            "properties": {
              "url": { "type": "string", "format": "uri" },
              "purpose": { "type": "string" },
              "integrity": { "type": "string", "pattern": "^sha(256|384|512)-" }
            }
          }
        },
        "dataRetention": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "claim": { "type": "string", "maxLength": 500 },
            "retainsPersonalData": { "type": "boolean" },
            "maxRetentionDays": { "type": "integer", "minimum": 0 }
          }
        }
      }
    }
  },

  "$defs": {
    "category": {
      "description": "Primary content category, from the fixed catalogue. Required Identity field. Drives the intake-form picker (W15), the MCP scaffold_mp param, and a net-new Features/install browse/filter facet (NOTE: this browse facet does not exist in the wireframes yet — the field enables it; today only publisher.type, a trust tier, exists and it is NOT a content category). A single primary category (not categories[]) keeps C1 validation and the picker simple; an optional secondary tags[] is deferred to a later schema minor. 'other' is the safety valve so AI generation never blocks on an unmappable MP. Extensible; new categories add enum values (mirrors the $defs/surface convention).",
      "type": "string",
      "enum": [
        "scheduling",
        "time_attendance",
        "hr_people",
        "finance_invoicing",
        "compliance",
        "care_ndis",
        "comms",
        "reporting",
        "productivity",
        "integrations",
        "other"
      ]
    },
    "surface": {
      "description": "A host surface a panel/contribution can target. Extensible; new surfaces add enum values. team_member_details and client_details are host surfaces that MPs contribute panel 'tabs' into — Team Members and Clients are NOT Mini Programs.",
      "type": "string",
      "enum": ["dashboard", "team_member_details", "client_details", "full_page"]
    },
    "namedContribution": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "name"],
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "description": { "type": "string" }
      }
    },
    "jsonSchema": {
      "description": "An embedded JSON Schema (2020-12 subset). Kept permissive here; the manifest tooling validates it is itself a valid schema.",
      "type": "object"
    },
    "inputMapSource": {
      "description": "One source for a single mapped field. The original four shapes (trigger / condition / option / const — actions-runtime.md §9.7) plus the 2.22 additions: serviceRead (E6), item (E5 forEach element), template (E3 — plain-text composition with {{placeholder | pipe}} syntax, tooling-validated). Every non-template shape may carry an optional 'default' and an optional closed-operator 'transform' chain (E2, max 8 steps).",
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["from", "path"],
          "properties": {
            "from": { "const": "trigger" },
            "path": { "type": "string" },
            "default": {},
            "transform": { "$ref": "#/$defs/transformChain" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["from", "ref", "path"],
          "properties": {
            "from": { "const": "condition" },
            "ref": { "type": "string" },
            "path": { "type": "string" },
            "default": {},
            "transform": { "$ref": "#/$defs/transformChain" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["from", "ref", "path"],
          "properties": {
            "from": { "const": "serviceRead" },
            "ref": { "type": "string" },
            "path": { "type": "string" },
            "default": {},
            "transform": { "$ref": "#/$defs/transformChain" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["from", "path"],
          "properties": {
            "from": { "const": "option" },
            "path": { "type": "string" },
            "default": {},
            "transform": { "$ref": "#/$defs/transformChain" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["from", "path"],
          "properties": {
            "from": { "const": "item" },
            "path": { "type": "string" },
            "default": {},
            "transform": { "$ref": "#/$defs/transformChain" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["const"],
          "properties": {
            "const": {},
            "default": {}
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["template"],
          "properties": {
            "template": {
              "type": "string",
              "maxLength": 1000,
              "description": "E3 — plain text with {{source.path | operator(args)}} placeholders over this Action's declared sources; rendered as data (textContent downstream, never HTML). Templates used for user-facing copy SHOULD default into optionsSchema so tenants/AI can tune them."
            },
            "default": {}
          }
        }
      ]
    },
    "transformChain": {
      "description": "2.22 E2 — an ordered chain (max 8) of closed-set operators applied to the resolved source value. Operators are IN-BINARY; config supplies operands only (the L6 app-store line). Type-checked against the source/target schemas by the validator.",
      "type": "array",
      "maxItems": 8,
      "items": { "$ref": "#/$defs/transformStep" }
    },
    "transformStep": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op"],
      "properties": {
        "op": {
          "enum": [
            "concat", "upper", "lower", "trim", "slice", "replace",
            "add", "subtract", "multiply", "divide", "round", "clamp",
            "format", "add_duration", "diff", "day_of_week", "bucket_time",
            "coalesce", "default", "exists", "not", "equals",
            "map",
            "first", "last", "count", "sum", "pluck", "join", "find", "filter"
          ]
        },
        "args": {
          "description": "Operator operands (literals or source refs where the operator signature allows — 2.22 §2.2 is the signature table). 'map' takes {table:{from:to,...}, default}; 'bucket_time' takes {ranges:[{from,to,label}], timezoneFrom?}; 'find'/'filter' take an L6 predicate over item fields.",
          "type": "object"
        }
      }
    },
    "predicate": {
      "description": "2.22 — a closed L6-comparator predicate over declared sources (used by activity.select 'when' and contributions.interactions 'visibleWhen'). One level of allOf/anyOf composition.",
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["source", "op"],
          "properties": {
            "source": { "$ref": "#/$defs/inputMapSource" },
            "op": { "enum": ["exists", "not_exists", "equals", "not_equals", "one_of", "range"] },
            "operand": {},
            "operands": { "type": "array" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["allOf"],
          "properties": {
            "allOf": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/predicate/oneOf/0" } }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["anyOf"],
          "properties": {
            "anyOf": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/predicate/oneOf/0" } }
          }
        }
      ]
    },
    "selectBranch": {
      "description": "One branch of activity.select (E4). Either a 'when' branch or the REQUIRED terminal 'else' branch (which may 'skip'). The validator enforces: exactly one else, and it is last.",
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["when", "name"],
          "properties": {
            "when": { "$ref": "#/$defs/predicate" },
            "mp": { "type": "string" },
            "name": { "type": "string" },
            "inputMap": { "type": "object", "additionalProperties": { "$ref": "#/$defs/inputMapSource" } }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["else", "name"],
          "properties": {
            "else": { "const": true },
            "mp": { "type": "string" },
            "name": { "type": "string" },
            "inputMap": { "type": "object", "additionalProperties": { "$ref": "#/$defs/inputMapSource" } }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["else", "skip"],
          "properties": {
            "else": { "const": true },
            "skip": { "const": true }
          }
        }
      ]
    },
    "contractVersion": {
      "description": "2.21 (D17) — primitive-level semver, independent of the MP version. Defaults to the MP version at build when absent; the build emits the normalized PrimitiveContract tuple either way.",
      "type": "string",
      "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$"
    },
    "deprecatedMarker": {
      "description": "2.21 §4 (D17) — marks a retained primitive as deprecated (still fully dispatchable; broker stamps touching runs). Removal itself additionally requires the top-level removalPlan.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "replacement": { "type": "string" },
        "removeAfter": { "type": "string" }
      }
    }
  }
};
