# `actions`, `addons`, `exchangeRates`, `externalToken`, `identityRecovery`, `webhooks`

The operational sidecar — surfaces the issuer and platform admin lean on when they need to act on something other than a token's primary lifecycle. Actions queue, addon contracts (yield schedules, XvP), external token import, identity recovery, and webhook configuration.

---

## actions (`client.actions.*`)

### Overview

Cross-token user-action feed. An _action_ is something the indexed runtime says you can do right now — approve an XvP settlement, redeem a maturing bond, claim accrued yield. `actions.list` is the single endpoint that powers the Actions tab in both apps.

### Method

| Method                | Path                    | Idempotency | Sync/async |
| --------------------- | ----------------------- | ----------- | ---------- |
| `client.actions.list` | GET `/api/actions/list` | n/a         | sync       |

### Recipe: Pending actions for the current user

```ts
const actions = await client.actions.list({
  query: {
    page: { limit: 25, offset: 0 },
    filters: [{ id: "status", operator: "eq", value: "PENDING" }],
    sortBy: "activeAt",
    sortDirection: "desc",
  },
});

for (const action of actions.data) {
  console.log(action.id, action.actionType, action.target, action.activeAt);
}
```

Action types include `MatureBond`, `RedeemBond`, `ClaimYield`, `ApproveMaturityAllowance`, `ApproveYieldAllowance`, `ApproveXvPSettlement`, `ExecuteXvPSettlement`, `UpdateKYCData`. The action itself is _not_ executed via this namespace — the user clicks through to the resource-specific mutation:

| Action type                | Mutation to call                                                    |
| -------------------------- | ------------------------------------------------------------------- |
| `MatureBond`               | `client.token.mature`                                               |
| `RedeemBond`               | `client.token.redeem`                                               |
| `ClaimYield`               | `client.addons.fixedYieldSchedule.claimYield` (verify path)         |
| `ApproveMaturityAllowance` | `client.token.approve` for the maturity-redemption feature contract |
| `ApproveYieldAllowance`    | `client.token.approve` for the yield-schedule contract              |
| `ApproveXvPSettlement`     | `client.addons.xvp.approve`                                         |
| `ExecuteXvPSettlement`     | `client.addons.xvp.execute`                                         |

### When you'd build a screen for this

- **Out of scope for v1 reference apps** — the v1 reference apps don't surface XvP / maturity / yield yet. If you add the Actions tab later, `actions.list` is the one endpoint that surfaces everything in one place.

---

## addons (`client.addons.*`)

### Overview

Feature contracts deployed alongside a token. Two sub-namespaces in v1:

- **`addons.fixedYieldSchedule`** — fixed-rate yield distribution attached to a bond. Issuer creates a schedule, top-up the yield treasury with the denomination asset, and holders claim accrued yield at coupon dates.
- **`addons.xvp`** — atomic delivery-vs-payment settlements between two parties (token A flows one way, token B flows the other, both legs atomic on-chain).

### addons.fixedYieldSchedule (`client.addons.fixedYieldSchedule.*`)

Verify the exact method list against your SDK type definitions. Common methods:

| Method                                        | Purpose                                         |
| --------------------------------------------- | ----------------------------------------------- |
| `client.addons.fixedYieldSchedule.list`       | List schedules for the org                      |
| `client.addons.fixedYieldSchedule.read`       | Read a single schedule by address               |
| `client.addons.fixedYieldSchedule.create`     | Deploy a new yield schedule attached to a token |
| `client.addons.fixedYieldSchedule.topUp`      | Send denomination asset into the yield treasury |
| `client.addons.fixedYieldSchedule.claimYield` | Claim accrued yield as a holder                 |

### addons.xvp (`client.addons.xvp.*`)

XvP (cross-token / X-versus-Payment) — atomic two-leg settlement. Common methods:

| Method                      | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `client.addons.xvp.list`    | List settlements involving the caller                          |
| `client.addons.xvp.read`    | Read a single settlement by address                            |
| `client.addons.xvp.create`  | Propose a settlement (both parties named, both legs specified) |
| `client.addons.xvp.approve` | Approve a settlement you're a counterparty to                  |
| `client.addons.xvp.execute` | Execute (atomic) once both sides have approved                 |
| `client.addons.xvp.cancel`  | Cancel a settlement before execute                             |

### When you'd build a screen for this

- **Out of scope for v1 reference apps** in this repo (Phase 2 in our roadmap). The Actions tab links into these mutations when the corresponding action types appear.

---

## exchangeRates (`client.exchangeRates.*`)

### Overview

FX / oracle rate read surface. DALP carries on-chain rate feeds for fiat ↔ token denomination pairs; the SDK exposes them for UI conversion (e.g., "show this USD-denominated bond's NAV in EUR").

### Methods

| Method                         | Path                                                             | Idempotency | Sync/async |
| ------------------------------ | ---------------------------------------------------------------- | ----------- | ---------- |
| `client.exchangeRates.read`    | GET `/api/exchange-rates/{baseCurrency}/{quoteCurrency}`         | n/a         | sync       |
| `client.exchangeRates.list`    | GET `/api/exchange-rates`                                        | n/a         | sync       |
| `client.exchangeRates.history` | GET `/api/exchange-rates/{baseCurrency}/{quoteCurrency}/history` | n/a         | sync       |

### Recipe: Read current rate

```ts
const rate = await client.exchangeRates.read({
  params: { baseCurrency: "USD", quoteCurrency: "EUR" },
});
if (rate.data) {
  console.log(rate.data.rate); // number
  console.log(rate.data.effectiveAt); // Date
} else {
  // null when no rate is configured for the pair — fall back to gracefully
}
```

### Recipe: Rate history for a chart

```ts
const history = await client.exchangeRates.history({
  params: { baseCurrency: "USD", quoteCurrency: "EUR" },
  query: { fromTimestamp, toTimestamp, intervalSeconds: 86400 },
});
for (const point of history.data) {
  console.log(point.effectiveAt, point.rate);
}
```

### When you'd build a screen for this

- **Asset detail price display in a non-base currency** would use `exchangeRates.read` to convert the on-token base price. Optional in v1 reference apps.

---

## externalToken (`client.externalToken.*`)

### Overview

DALP tokens are deployed via the platform factory. _External tokens_ are ERC-20s deployed outside DALP that the platform tracks as denomination assets (USDC, EURC, etc.). `externalToken` exposes the list of recognized external assets and the admin endpoint to register a new one.

### Methods

| Method                          | Path                        | Idempotency | Sync/async |
| ------------------------------- | --------------------------- | ----------- | ---------- |
| `client.externalToken.list`     | GET `/api/external-tokens`  | n/a         | sync       |
| `client.externalToken.register` | POST `/api/external-tokens` | required    | async      |

### Recipe: List recognized external assets

```ts
const externals = await client.externalToken.list({
  query: { page: { limit: 50, offset: 0 } },
});
for (const ext of externals.data) {
  console.log(ext.address, ext.symbol, ext.decimals);
}
```

### Recipe: Register an external token (admin)

```ts
await client.externalToken.register({
  body: {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC mainnet
    walletVerification,
    idempotencyKey,
  },
});
```

### When you'd build a screen for this

- **Issuer Reserve Token wizard → Bond denomination asset selector** uses `externalToken.list` (filtered) to populate the dropdown of accepted USD-stable assets.
- **Platform admin "registered external tokens" table** (out of scope for v1) uses the full surface.

---

## identityRecovery (`client.identityRecovery.*`)

### Overview

When a holder loses their wallet (or has it compromised), an admin with `identityManager` role can recover the holder's on-chain identity to a new wallet — new wallet is provisioned, a new OnchainID is deployed, the old wallet is marked lost, balances are recovered, and all sessions / MFA / wallet verifications are reset.

The flow is two-step: **preview** (read what would happen, find blocking conditions) then **execute** (destructive).

### Methods

| Method                            | Path                                           | Idempotency | Sync/async |
| --------------------------------- | ---------------------------------------------- | ----------- | ---------- |
| `client.identityRecovery.preview` | GET `/api/identity-recovery/preview/{userId}`  | n/a         | sync       |
| `client.identityRecovery.execute` | POST `/api/identity-recovery/execute/{userId}` | required    | **async**  |
| `client.identityRecovery.status`  | GET `/api/identity-recovery/status/{userId}`   | n/a         | sync       |

### Recipe: Preview a recovery

```ts
const preview = await client.identityRecovery.preview({
  params: { userId: lostUserId },
});

console.log(preview.data.currentIdentityStatus);
console.log(preview.data.tokenBalancesToRecover); // [{ tokenAddress, balance }, ...]
console.log(preview.data.blockingConditions); // empty if recovery can proceed
```

### Recipe: Execute recovery

```ts
const executed = await client.identityRecovery.execute({
  params: { userId: lostUserId },
  body: { walletVerification, idempotencyKey },
});

// Async — workflow steps: new wallet → new OnchainID → recoverIdentity on-chain
//   → recover token balances → revoke sessions / MFA / wallet verifications.
await pollTransaction(executed.data.transactionId);
```

### Recipe: Check recovery status

```ts
const status = await client.identityRecovery.status({
  params: { userId: lostUserId },
});
console.log(status.data.phase); // "preview" | "in-progress" | "completed" | "failed"
console.log(status.data.steps); // per-step status with timestamps
```

### Common errors (recovery)

| Code                   | Status | When                                                                  | What to do                                  |
| ---------------------- | ------ | --------------------------------------------------------------------- | ------------------------------------------- |
| `RECOVERY_FORBIDDEN`   | 403    | Caller lacks `identityManager` role                                   | Route to admin                              |
| `RECOVERY_BLOCKED`     | 409    | Preview returns blocking conditions (active XvP, pending mature etc.) | Resolve the blocker before retrying         |
| `RECOVERY_IN_PROGRESS` | 409    | A recovery is already running for this user                           | Wait for `status` to reach a terminal state |

### When you'd build a screen for this

- **Issuer admin → "lost wallet" admin action** uses `preview` → confirmation modal → `execute` → poll `status`. Out of scope for v1 reference apps but a frequent post-MVP request.

---

## webhooks (`client.webhooks.*`)

### Overview

CRUD over webhook endpoint registrations. The cross-cutting [Webhook verification](../SKILL.md#cross-cutting-webhook-verification) section in SKILL.md covers the receiver side (signature verification, failure codes). This namespace is the _sender configuration_ side — register a URL, pick which event types to subscribe to, rotate the signing secret.

### Methods (verify against your SDK type definitions — some are v2-only)

| Method                         | Purpose                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `client.webhooks.list`         | List configured webhook endpoints                                                      |
| `client.webhooks.read`         | Read one                                                                               |
| `client.webhooks.create`       | Register a new endpoint (returns the signing secret once)                              |
| `client.webhooks.update`       | Update URL / subscribed events / disabled flag                                         |
| `client.webhooks.rotateSecret` | Issue a new signing secret; the old one remains valid during a rotation overlap window |
| `client.webhooks.delete`       | Remove the endpoint                                                                    |

### Recipe: Register a webhook

```ts
const registered = await client.webhooks.create({
  body: {
    url: "https://my-app.example.com/webhooks/dalp",
    subscribedEvents: ["token.created", "token.transfer.completed", "user.kyc.approved"],
    description: "Production webhook for Acme Capital",
    walletVerification,
    idempotencyKey,
  },
});

// The signing secret is shown ONCE — store it immediately, you can't read it back.
console.log(registered.data.signingSecret); // "dalp_whsk_..."
console.log(registered.data.id);
```

### Recipe: Rotate a webhook secret (with overlap)

```ts
const rotated = await client.webhooks.rotateSecret({
  params: { webhookId },
  body: { walletVerification, idempotencyKey },
});

// During the rotation overlap window (default 24h), both the old and the new
// secret are accepted by the verifier. Configure your receiver to try both:
//   verifyWebhook({ rawBody, headers, secret: [oldSecret, rotated.data.newSigningSecret] })
```

### Recipe: Look up sent events for an endpoint

Verify the exact method shape — typically `client.webhooks.deliveries.list({ params: { webhookId }, query: { page } })` or similar.

### When you'd build a screen for this

- **Platform admin → "configure webhooks" table** uses the full CRUD. Out of scope for v1 reference apps; both reference apps are SDK-consumers, not webhook receivers.
- The receiver side (`verifyWebhook` + the failure codes) lives in [SKILL.md → Webhook verification](../SKILL.md#cross-cutting-webhook-verification).

---

## Reference apps cross-link summary

| Reference app screen                                 | Methods used                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Issuer Reserve Token → Bond denomination selector    | `externalToken.list`                                                              |
| Issuer Token Console → Actions (out of scope for v1) | `actions.list`                                                                    |
| Issuer admin → Recover wallet (out of scope for v1)  | `identityRecovery.preview`, `identityRecovery.execute`, `identityRecovery.status` |
| Investor Asset detail → FX display (optional in v1)  | `exchangeRates.read`                                                              |
| Platform admin → Webhooks (out of scope for v1)      | `webhooks.*`                                                                      |
