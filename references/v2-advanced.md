# v2-only & specialized domains

The v2 API surface is a near-superset of v1's reads with canonical paginated shape (`{ data, meta, links }`) plus several domains that exist only at v2. This file covers the v2-only ones plus the read-side specializations.

> **Hard rule:** v2 owns _queries_; v1 still owns _mutations_ across the shared namespaces. If you're calling `v2/token/...` for anything but a list / read, you're at the wrong endpoint.

> All recipes are mined from the SDK's canonical type definitions and test fixtures.

---

## monitoring (`client.monitoring.api.*`, `client.monitoring.blockchain.*`)

### Overview

API + blockchain telemetry. Two distinct sub-namespaces:

- **`monitoring.api`** — request rates, error rates, latency percentiles, top endpoints by traffic. Sourced from the DAPI gateway.
- **`monitoring.blockchain`** — block-level metrics (height, time, gas), per-chain health, recent reorgs, indexer lag.

> **Note**: the SDK README documents `monitoring` as a flat namespace; the v2 contract exposes it nested as `{ api, blockchain }`. The actual SDK shape is the nested one.

### Common methods (verify exact set in `contract.ts`)

| Method                                     | Purpose                                                  |
| ------------------------------------------ | -------------------------------------------------------- |
| `client.monitoring.api.requestRate`        | Time-series of requests-per-second                       |
| `client.monitoring.api.errorRate`          | Time-series of error percentage                          |
| `client.monitoring.api.latencyPercentiles` | p50/p95/p99 latency over a window                        |
| `client.monitoring.api.topEndpoints`       | Highest-traffic endpoints in a window                    |
| `client.monitoring.blockchain.chainStatus` | Per-chain block height, last-seen timestamp, indexer lag |
| `client.monitoring.blockchain.gasMetrics`  | Recent gas-price percentiles                             |

### Recipe

```ts
const apiHealth = await client.monitoring.api.requestRate({
  query: { fromTimestamp, toTimestamp, intervalSeconds: 60 },
});
for (const point of apiHealth.data) {
  console.log(point.timestamp, point.requestsPerSecond);
}

const chainHealth = await client.monitoring.blockchain.chainStatus({
  query: { chainId: 1 },
});
console.log(chainHealth.data.headBlockNumber, chainHealth.data.indexerLagSeconds);
```

Both endpoints support **cursor pagination** rather than offset — these are high-cardinality time-series and the v2 list-endpoint paginated shape doesn't apply per the repo's `dapi-route-safety` skill.

### When you'd build a screen for this

- **Platform admin "Platform Status" page** (out of scope for the v1 reference apps in this repo) uses both sub-namespaces.

---

## compliance (`client.compliance.*`)

### Overview

The v2 compliance expression management layer. v1's `client.token.compliance` reads the _modules attached to a token_. The v2 `compliance` namespace operates on _compliance expressions_ — composable rule fragments (jurisdiction filters, identity allow/block lists, supply caps, time locks) that you can save, share across tokens, and reference from a token's compliance config.

### Common methods (verify in `contract.ts`)

| Method                                          | Purpose                                        |
| ----------------------------------------------- | ---------------------------------------------- |
| `client.compliance.expressions.list`            | Paginated list of saved expressions in the org |
| `client.compliance.expressions.read`            | Read a single expression by id                 |
| `client.compliance.expressions.create`          | Save a new expression                          |
| `client.compliance.expressions.update`          | Modify a saved expression                      |
| `client.compliance.expressions.delete`          | Remove an expression                           |
| `client.compliance.expressions.attachToToken`   | Attach to a specific token's compliance config |
| `client.compliance.expressions.detachFromToken` | Detach                                         |

### Recipe: List saved expressions

```ts
const expressions = await client.compliance.expressions.list({
  query: { page: { limit: 25, offset: 0 } },
});
for (const expr of expressions.data) {
  console.log(expr.id, expr.name, expr.fragments);
}
```

### When you'd build a screen for this

- **Issuer "compliance library" admin surface** (out of scope for v1) lets the issuer save and reuse compliance bundles across tokens.

---

## organization (`client.organization.*`)

### Overview

Organization-level reads. The v1 surface for organization mutations lives under the Better Auth `auth.organization.*` namespace; this v2 read namespace exposes the org's data shape (memberships, deployment state, system pointer, branding) for the org dashboard.

### Common methods

| Method                             | Purpose                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `client.organization.read`         | Read the current org (resolved from `x-organization-id`) |
| `client.organization.list`         | List orgs the caller has access to                       |
| `client.organization.members.list` | Paginated list of org members                            |

### Recipe

```ts
const org = await client.organization.read({});
console.log(org.data.id, org.data.name, org.data.deploymentState);
```

### When you'd build a screen for this

- **Both apps' header** would use `organization.read` to show the org name + branding. The current v1 reference apps hard-code "Acme Capital" — the swap-in point for real org names is here.

---

## participants (`client.participants.*`)

### Overview

A _participant_ is the bridge between a user, their wallets (EOA + smart wallets), and their OnchainID. Same as `account.search`, the v2 `participants` namespace is the read surface for the platform's participant directory — useful when you need to map a wallet to its full identity context across organizations.

### Common methods

| Method                         | Purpose                                   |
| ------------------------------ | ----------------------------------------- |
| `client.participants.list`     | Paginated list of participants in the org |
| `client.participants.read`     | Read a single participant by id           |
| `client.participants.byWallet` | Find a participant by wallet address      |

### Recipe

```ts
const participants = await client.participants.list({
  query: { page: { limit: 50, offset: 0 } },
});
for (const p of participants.data) {
  console.log(p.id, p.userId, p.identityAddress, p.wallets);
}
```

### When you'd build a screen for this

- **Issuer admin → directory** uses `participants.list` for a full participant view. Out of scope for v1 reference apps.

---

## directory (`client.directory.*`)

### Overview

Cross-org participant + token directory. Read-only surface for finding entities you have explicit visibility into (counterparty for an XvP, holder for forced recovery, etc.). DALP enforces strict cross-tenant boundaries — `directory` returns the _permitted_ slice of cross-org data, not the full graph.

### Common methods

| Method                               | Purpose                                   |
| ------------------------------------ | ----------------------------------------- |
| `client.directory.participants.list` | Paginated cross-org participant directory |
| `client.directory.tokens.list`       | Paginated cross-org token directory       |

### When you'd build a screen for this

- **Issuer XvP counterparty picker** (out of scope for v1) uses `directory.participants.list` to find external counterparties.

---

## smartWallets (`client.smartWallets.*`)

### Overview

DALP optionally provisions ERC-4337 smart-wallet executors for each participant (account abstraction). When enabled, `msg.sender` on every contract call is the smart wallet, not the user's EOA — gives DALP gas sponsorship, session keys, and recovery patterns. `smartWallets` exposes the read surface for which participants have smart wallets and their counterfactual / deployed state.

### Common methods

| Method                              | Purpose                               |
| ----------------------------------- | ------------------------------------- |
| `client.smartWallets.list`          | List all smart wallets in the org     |
| `client.smartWallets.read`          | Read a single smart wallet by address |
| `client.smartWallets.byParticipant` | Find a participant's smart wallet     |

### Recipe

```ts
const wallets = await client.smartWallets.list({
  query: { page: { limit: 50, offset: 0 } },
});
for (const w of wallets.data) {
  console.log(w.address, w.deployed, w.counterfactualAddress);
}
```

### Routing your call through a smart wallet

Per the DAPI participant + executor middleware, every authenticated v2 mutation goes through the participant + executor chain. By default, DALP picks EOA or smart-wallet automatically based on org policy. To force one or the other for a single request, set the `X-Executor` header on the SDK config:

```ts
const dalp = createDalpClient({
  url,
  apiKey,
  headers: { "X-Executor": "smart-wallet" }, // | "eoa"
});
```

### When you'd build a screen for this

- **Issuer admin → smart wallet status** would use `smartWallets.list` to show which participants have deployed smart wallets vs. counterfactual-only. Out of scope for v1 reference apps.

---

## contracts (`client.contracts.*`)

### Overview

Registry of every contract deployed via DALP factories — tokens, OnchainIDs, smart wallets, compliance modules, yield schedules, XvP settlements. The investor or issuer apps rarely query this directly; it's the platform admin surface for inspecting "what does DALP own on-chain for this org?".

### Common methods

| Method                    | Purpose                                               |
| ------------------------- | ----------------------------------------------------- |
| `client.contracts.list`   | Paginated list of registered contracts                |
| `client.contracts.read`   | Read a single contract by address                     |
| `client.contracts.byKind` | Filter to one contract kind (e.g. token, smartWallet) |

### When you'd build a screen for this

- **Platform admin "contracts" table** (out of scope for v1).

---

## historicalBalances (`client.historicalBalances.*`)

### Overview

Per-holder balance time-series. Where `client.token.statsTotalSupply` is _token-level_ (one series per token), `historicalBalances` is _holder-level_ (one series per (token, holder) pair). Used for portfolio history, P&L curves, tax-lot reconstruction.

### Common methods

| Method                               | Purpose                                                 |
| ------------------------------------ | ------------------------------------------------------- |
| `client.historicalBalances.byHolder` | Time-series for a single holder across all their tokens |
| `client.historicalBalances.byToken`  | Time-series for all holders of a single token           |
| `client.historicalBalances.byPair`   | Time-series for one (token, holder) pair                |

### Recipe

```ts
const history = await client.historicalBalances.byHolder({
  query: {
    holderAddress: me.data.walletAddress,
    fromTimestamp,
    toTimestamp,
    intervalSeconds: 86400,
  },
});

for (const point of history.data) {
  console.log(point.timestamp, point.totalValueUsd, point.balancesPerToken);
}
```

Cursor-paginated like the other time-series endpoints.

### When you'd build a screen for this

- **Investor portfolio history chart** uses `historicalBalances.byHolder`.

---

## Other v2-only domains worth knowing about

These show up in the v2 SDK surface but aren't on the critical path for the reference apps in this repo. Skim now, drill in when you need them.

| Namespace                | What it is                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client.invitation`      | Cross-org invitation flow — issuer invites a user, they accept, they join with KYC. Used by `apps/issuer` if you build a "send invite" UI in a later sprint.                                                |
| `client.metadata`        | Generic entity metadata read/write surface (token metadata, user metadata, etc.).                                                                                                                           |
| `client.platformStatus`  | High-level platform health — "is DAPI up? are indexers caught up?". Surfaced by the dashboard health badge.                                                                                                 |
| `client.restate`         | Read-only access to Restate workflow runs (the durable workflow engine that drives all async mutations). Useful for "show me the workflow trace for this transaction".                                      |
| `client.webhookReceipts` | Delivery log for webhooks sent FROM DALP — each row is "we tried to deliver event X to endpoint Y at time Z, got status N". Pairs with the `webhooks` config surface in [`operational.md`](operational.md). |

For each, your SDK type definitions are the authoritative shape.

---

## Reference apps cross-link summary

| Reference app screen               | Methods used                       |
| ---------------------------------- | ---------------------------------- |
| Both apps' org header (eventually) | `organization.read`                |
| Investor portfolio chart           | `historicalBalances.byHolder`      |
| Everything else                    | Out of scope for v1 reference apps |

---

## A note on the v2 paginated shape

Every v2 list endpoint returns:

```ts
{
  data: T[],
  meta: {
    totalCount: number,
    offset: number,
    limit: number,
    facets?: Record<string, FacetEntry[]>,
  },
  links: {
    self: string,
    next?: string,
    prev?: string,
  },
}
```

Inputs use the canonical `createCollectionInputSchema` helper — `{ page: { limit, offset }, sortBy, sortDirection, filters: [{ id, operator, value }], globalSearch? }`. Time-series endpoints (`monitoring`, `historicalBalances`) use **cursor pagination** instead — `query: { cursor?, limit, intervalSeconds }`. The cross-cutting pagination convention is enforced by the repo's `dalp/require-paginated-response` lint rule.
