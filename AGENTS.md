# Tommy SDK Agent Guide

This repository defines the public Mini Program contract and host runtimes.

## Package Map

- `packages/manifest`: schema, parsing, validation, and catalogues
- `packages/sdk`: MP-facing API and host adapters
- `packages/actions-runtime`: capability and action broker
- `packages/offline-sync`: per-MP storage and replay
- `packages/panel-runtime`: panel mounting/runtime
- `packages/reference-mp`: executable contract example

## Invariants

- Public exports and wire shapes are compatibility boundaries.
- Runtimes must not import app or private-MP implementation code.
- Authorization is default-deny and enforced by the host/API, not caller claims.
- Storage and replay are tenant-scoped, bounded, and teardown-safe.
- Generated schema/catalogue outputs come from their scripts.

## Checks

```sh
corepack yarn test:packages
```

`test:packages` includes the store-name literal check. Run app loader and
private-MP isolation checks when a contract changes.

Comments state what the code does now and why, when that isn't obvious; rollout history, plan or ticket ids, dated rulings, review rounds and names go in commits, PRs and ledgers.
`scripts/comment-history.test.mjs` fails on new comment lines carrying those markers; lower its baseline after a cleanup with `COMMENT_HISTORY_BASELINE=tighten`.
