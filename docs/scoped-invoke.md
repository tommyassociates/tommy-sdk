# Handler-scoped invokes (host API 17)

Host API 17 adds `ctx.invoke(activity, args, { idempotencyKey }?)` to local
activity handlers. It has the same arguments, generated client keys and receipts
as `tommy.actions.invoke`. Use it for child activities the handler awaits:

```js
async function parent(args, ctx) {
  const child = await ctx.invoke('availability.lock_window', args);
  return child.result;
}
```

The broker attaches a private parent-run token, executes that child inline on
its parent's chain, and carries the chain's depth and fan-out limits. Scoped
invokes use the handler MP's identity and current capability token, including
when another MP invoked the parent. A scope expires when its handler finishes.
Invoking an ancestor activity with its running idempotency key rejects with
non-retryable `LoopDetected` (`rule: idempotency.cycle`) before joining it.

## Bundle selection and compatibility

The host passes the existing release entry's `minHostApi` to
`broker.registerMp`; this is release metadata, not a manifest-schema field.
There is no additional contract flag.

| Bundle release entry | Untagged `tommy.actions.invoke` on a host with this broker | `ctx.invoke` |
| --- | --- | --- |
| Missing `minHostApi`, or below 17 | Ambient handler re-entrancy; same-key overlaps join the running run | Inline while its parent is active |
| `minHostApi >= 17` | FIFO per source MP, including calls arriving during a handler | Inline while its parent is active |

The same entry metadata controls local and internal registrations; an omitted
level retains ambient re-entrancy. Internal bundle eligibility remains governed
by the loader's existing internal-source rule.

A release that requires FIFO publishes with `min_host_api=17`, which the API
returns as `minHostApi`. Existing release lanes retain the previous generation
for hosts below 17. A host below 17 cannot run a release requiring 17.

Availability accepts `ctx.invoke` when offered and uses
`tommy.actions.invoke` when the handler context lacks it. Its manifest minimum
is unchanged: that source can run on an older host through ambient re-entrancy.
Publishing it in the 17 lane opts into FIFO on the newer host without hiding
Availability from older store builds, which receive their compatible generation.
No bundle generation or publishing is part of this source change.

The canonical advertisement is `HOST_API_LEVEL` in
`core/src/utils/host-identity.js`, shared by MP init, loader eligibility and
`X-Host-Api`. Shipping requires that constant to be 17; changing only the broker
threshold does not advertise a newer host.
