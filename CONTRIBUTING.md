# Contributing

## Mini Program isolation — rules for new code

Tommy is being refactored into an isolated Mini Program platform (see `refactor-plan/`). While that work is in progress, **new code must not add to the coupling the refactor is removing.** CI enforces the first two rules; the third is a review check.

### 1. No new cross-MP imports
Do not add an `import` from one addon (Mini Program) into another. Addons must not reach into each other's source. Inter-addon behaviour goes through the Actions bus once it exists; until then, if two addons need to share something, raise it — do not wire a direct import. *(Enforced: ESLint `no-cross-addon-import`, dependency-cruiser `no-addon-to-addon`.)*

### 2. No new shared mutable state across MP boundaries
Do not add new global Vuex modules, `window.*` globals, or singletons that addons read or mutate across their boundaries. Per-addon state stays inside that addon. Do not add new deep imports from `tommy-core/src/*` internals — the ~987 that exist today are a tracked, shrinking baseline; **do not grow it.** *(Enforced: ESLint `no-core-internal-import` + dependency-cruiser `no-addon-to-core-internals`, block-on-increase.)*

### 3. New panels must use the panel container API
Do not add a new dashboard or detail-surface panel as a bare component baked into the shell. New panels go through the panel container API. **That API is not built yet** — so until it is, **do not add new panels.** If you have a genuine need for one before the panel runtime lands, raise it with the refactor leads first.

### Why
Every shortcut taken here becomes migration debt someone pays down later — and makes the isolation boundary leakier when it lands. The detectors will flag violations in CI. If a detector blocks a change you believe is legitimate, that is a conversation to have, not a rule to route around.

---
