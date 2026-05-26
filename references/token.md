# `client.token.*` — Token domain

The single largest namespace in the SDK. Covers token deployment, lifecycle mutations, role management, document handling, and every read surface a token-aware UI needs (holders, events, stats, allowance, compliance, metadata).

All recipes here are mined from the SDK's canonical test fixtures.

> Most mutations take a `walletVerification` field — the response payload from a wallet-auth challenge (pincode, two-factor, passkey, or secret codes). Without a valid verification, the request is rejected. See the cross-cutting [Auth flow](../SKILL.md#cross-cutting-auth-flow) section for how to mint one.

---

## token (`client.token.*`) — core

### Overview

The token namespace exposes every operation against an ERC-3643 / SMART asset deployed via DALP: deploy a new token, read its current state, mutate roles, supply, freezes, and compliance, list every deployed asset, search the indexed registry. Mutations return either a synchronous receipt (token state after the on-chain call) or an async envelope with a `statusUrl` you poll.

### Core methods

| Method                                   | Path                                                        | Idempotency | Sync/async |
| ---------------------------------------- | ----------------------------------------------------------- | ----------- | ---------- |
| `client.token.create`                    | POST `/api/token`                                           | required    | async      |
| `client.token.read`                      | GET `/api/token/{tokenAddress}`                             | n/a (read)  | sync       |
| `client.token.list`                      | GET `/api/token`                                            | n/a (read)  | sync       |
| `client.token.search`                    | GET `/api/token/search`                                     | n/a (read)  | sync       |
| `client.token.grantRole`                 | POST `/api/token/{tokenAddress}/grant-role`                 | required    | sync       |
| `client.token.grantRoleByParticipant`    | POST `/api/token/{tokenAddress}/grant-role-by-participant`  | required    | sync       |
| `client.token.revokeRole`                | POST `/api/token/{tokenAddress}/revoke-role`                | required    | sync       |
| `client.token.revokeRoleByParticipant`   | POST `/api/token/{tokenAddress}/revoke-role-by-participant` | required    | sync       |
| `client.token.pause`                     | POST `/api/token/{tokenAddress}/pause`                      | required    | sync       |
| `client.token.unpause`                   | POST `/api/token/{tokenAddress}/unpause`                    | required    | sync       |
| `client.token.mint`                      | POST `/api/token/{tokenAddress}/mint`                       | required    | async      |
| `client.token.burn`                      | POST `/api/token/{tokenAddress}/burn`                       | required    | async      |
| `client.token.transfer`                  | POST `/api/token/{tokenAddress}/transfer`                   | required    | async      |
| `client.token.forcedTransfer`            | POST `/api/token/{tokenAddress}/forced-transfer`            | required    | async      |
| `client.token.approve`                   | POST `/api/token/{tokenAddress}/approve`                    | required    | sync       |
| `client.token.redeem`                    | POST `/api/token/{tokenAddress}/redeem`                     | required    | async      |
| `client.token.mature`                    | POST `/api/token/{tokenAddress}/mature`                     | required    | async      |
| `client.token.freezeAddress`             | POST `/api/token/{tokenAddress}/freeze-address`             | required    | sync       |
| `client.token.freezePartial`             | POST `/api/token/{tokenAddress}/freeze-partial`             | required    | sync       |
| `client.token.unfreezePartial`           | POST `/api/token/{tokenAddress}/unfreeze-partial`           | required    | sync       |
| `client.token.recoverTokens`             | POST `/api/token/{tokenAddress}/recover-tokens`             | required    | async      |
| `client.token.forcedRecover`             | POST `/api/token/{tokenAddress}/forced-recover`             | required    | async      |
| `client.token.recoverERC20`              | POST `/api/token/{tokenAddress}/recover-erc20`              | required    | async      |
| `client.token.setCap`                    | POST `/api/token/{tokenAddress}/set-cap`                    | required    | sync       |
| `client.token.updateCollateral`          | POST `/api/token/{tokenAddress}/update-collateral`          | required    | async      |
| `client.token.setYieldSchedule`          | POST `/api/token/{tokenAddress}/set-yield-schedule`         | required    | async      |
| `client.token.setPrice`                  | POST `/api/token/{tokenAddress}/set-price`                  | required    | sync       |
| `client.token.metadata` (read)           | GET `/api/token/{tokenAddress}/metadata`                    | n/a         | sync       |
| `client.token.features` (read)           | GET `/api/token/{tokenAddress}/features`                    | n/a         | sync       |
| `client.token.price` (read)              | GET `/api/token/{tokenAddress}/price`                       | n/a         | sync       |
| `client.token.allowance` (read)          | GET `/api/token/{tokenAddress}/allowance`                   | n/a         | sync       |
| `client.token.actions` (read)            | GET `/api/token/{tokenAddress}/actions`                     | n/a         | sync       |
| `client.token.denominationAssets` (read) | GET `/api/token/{tokenAddress}/denomination-assets`         | n/a         | sync       |

### Recipe: Deploy a stablecoin

```ts
const token = await client.token.create({
  body: {
    type: "stablecoin",
    name: `SDK Stablecoin ${Date.now()}`,
    symbol: "SCUSD",
    decimals: 6,
    countryCode: "840", // ISO 3166-1 numeric (US = 840)
    priceCurrency: "USD",
    basePrice: "1.00",
    walletVerification, // see Auth flow
  },
});
const tokenAddress = token.data.id; // contract address
```

### Recipe: Read a token

```ts
const token = await client.token.read({
  params: { tokenAddress },
});
console.log(token.data.symbol); // "SCUSD"
console.log(token.data.pausable.paused); // false
```

### Recipe: Grant roles to an admin wallet

```ts
await client.token.grantRole({
  params: { tokenAddress },
  body: {
    account: walletAddress,
    roles: ["admin", "emergency", "supplyManagement"],
    walletVerification,
  },
});
```

Available role names: `admin`, `emergency`, `supplyManagement`, `complianceManagement`, `auditor`, `governance`. The full list is enforced by the contract; passing an unknown role 422s.

### Recipe: Pause / unpause

```ts
await client.token.unpause({
  params: { tokenAddress },
  body: { walletVerification },
});

await client.token.pause({
  params: { tokenAddress },
  body: { walletVerification },
});
```

Pausing blocks all transfers globally for that token until `unpause` runs. Pause/unpause are synchronous — the response carries the new `pausable.paused` state.

### Recipe: Mint to multiple recipients

```ts
await client.token.mint({
  params: { tokenAddress },
  body: {
    recipients: [holderA, holderB, holderC],
    amounts: ["1000", "500", "250"],
    walletVerification,
  },
});
```

The `recipients` and `amounts` arrays must be the same length. Single-recipient is also valid (`recipients: holderA, amounts: "1000"`). 422 if `amount = "0"` or arrays mismatch.

### Recipe: Transfer batch

```ts
await client.token.transfer({
  params: { tokenAddress },
  body: {
    transfers: [
      { to: holderA, amount: "100" },
      { to: holderB, amount: "50" },
    ],
    walletVerification,
  },
});
```

422 if `transfers` is `[]`.

### Recipe: Approve a spender / revoke

```ts
// Approve
await client.token.approve({
  params: { tokenAddress },
  body: { spender, amount: "1000000", walletVerification },
});

// Revoke by setting allowance to 0
await client.token.approve({
  params: { tokenAddress },
  body: { spender, amount: "0", walletVerification },
});
```

### Recipe: Freeze a partial amount on a wallet

```ts
await client.token.freezePartial({
  params: { tokenAddress },
  body: {
    userAddress: holder,
    amount: "100", // amount to freeze (in the token's smallest unit)
    walletVerification,
  },
});
```

422 if `amount = "0"`.

### Recipe: Recover lost wallet (transfer all balances)

```ts
await client.token.forcedRecover({
  params: { tokenAddress },
  body: {
    lostWallet: oldAddress,
    newWallet: newAddress,
    walletVerification,
  },
});
```

`forcedRecover` reassigns the OnchainID to `newWallet` and moves all balances. Distinct from `recoverTokens` (operates on the calling wallet) and `recoverERC20` (recovers a foreign ERC20 mistakenly sent to the token contract).

### Recipe: Set supply cap / set price

```ts
const priceUpdate = await client.token.setPrice({
  params: { tokenAddress },
  body: { price: "3.14", currencyCode: "USD", walletVerification },
});
// priceUpdate.data.price === "3.14"

await client.token.setCap({
  params: { tokenAddress },
  body: { newCap: "10000000", walletVerification },
});
```

### Common errors (core)

| Code                             | Status | When                                                                                    | What to do                                                         |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `UNAUTHORIZED`                   | 401    | Missing or invalid API key                                                              | Re-issue key; never retry with the same one                        |
| `X_PARTICIPANT_FORBIDDEN`        | 404    | Caller has no access to this token's org                                                | Surface as "not found" — DALP does not leak existence cross-tenant |
| `INVALID_ADDRESS`                | 422    | `tokenAddress` not a valid 0x… hex                                                      | Validate client-side before calling                                |
| `VALIDATION_FAILED`              | 422    | Body schema mismatch (e.g. `amounts: ["0"]`, `transfers: []`, mismatched array lengths) | Inspect `error.details` for the field path                         |
| `INSUFFICIENT_ROLES`             | 403    | Caller wallet lacks the required role for the mutation                                  | Grant the role via `grantRole`; do not auto-retry                  |
| `TRANSFER_BLOCKED_BY_COMPLIANCE` | 409    | Transfer rejected by the rule engine (country, identity, freeze, supply cap)            | Surface `error.fix` to the user                                    |

### When you'd build a screen for this

- **Issuer Token Setup → Create & Deploy** uses `token.create`.
- **Issuer Bond Dashboard header** uses `token.read` + `token.metadata` + `token.features`.
- **Mint / Distribute / Freeze actions** in the dashboard's right panel use `token.mint` / `token.transfer` / `token.freezeAddress` / `token.freezePartial`.
- **Investor Browse** uses `token.list({ query: { page } })`.
- **Investor Transfer flow** uses `token.transfer` and must surface compliance 409s cleanly.

---

## token.compliance (`client.token.compliance.*`)

### Overview

Read the compliance configuration attached to a token (which modules are enabled, what parameters they hold). Mutations on compliance modules go through `client.token.addComplianceModule`, `removeComplianceModule`, and `setComplianceModuleParams` directly on the token namespace.

### Methods

| Method                                   | Path                                                      | Idempotency | Sync/async |
| ---------------------------------------- | --------------------------------------------------------- | ----------- | ---------- |
| `client.token.compliance` (read)         | GET `/api/token/{tokenAddress}/compliance`                | n/a         | sync       |
| `client.token.addComplianceModule`       | POST `/api/token/{tokenAddress}/add-compliance-module`    | required    | sync       |
| `client.token.removeComplianceModule`    | POST `/api/token/{tokenAddress}/remove-compliance-module` | required    | sync       |
| `client.token.setComplianceModuleParams` | POST `/api/token/{tokenAddress}/set-compliance-params`    | required    | sync       |
| `client.token.claimIssue`                | POST `/api/token/{tokenAddress}/claim-issue`              | required    | sync       |
| `client.token.claimRevoke`               | POST `/api/token/{tokenAddress}/claim-revoke`             | required    | sync       |

### Recipe: Read attached compliance modules

```ts
const compliance = await client.token.compliance({
  params: { tokenAddress },
});

for (const config of compliance.data.complianceModuleConfigs) {
  console.log(config.moduleAddress, config.parameters);
}
```

### Module catalog (the modules DALP ships)

| Module                              | What it enforces                               |
| ----------------------------------- | ---------------------------------------------- |
| `CountryAllowListComplianceModule`  | Holder country must be in the allowed list     |
| `CountryBlockListComplianceModule`  | Holder country must not be in the blocked list |
| `IdentityAllowListComplianceModule` | Holder identity must be in the allow list      |
| `IdentityBlockListComplianceModule` | Holder identity must not be in the block list  |
| `SupplyLimitComplianceModule`       | Max total supply across the token              |
| `TimeLockComplianceModule`          | Mint/transfer time windows                     |
| `TokenSupplyLimitComplianceModule`  | Per-holder supply cap                          |

A token's compliance is the union of all attached modules. A transfer that fails any module 409s with `TRANSFER_BLOCKED_BY_COMPLIANCE`; the `details` carry the module that rejected it.

### When you'd build a screen for this

- **Issuer Reserve Token wizard → Compliance Modules step** — multi-select cards write the chosen modules into the token-create body's `compliance` field.
- **Bond Dashboard → Compliance tab** reads `token.compliance` to show which modules are enabled.

---

## token.holders / token.holder (`client.token.holders`, `client.token.holder`)

### Overview

Paginated list of every holder of a token plus per-holder reads (balance, frozen amount, account metadata).

### Methods

| Method                 | Path                                    | Sync/async |
| ---------------------- | --------------------------------------- | ---------- |
| `client.token.holders` | GET `/api/token/{tokenAddress}/holders` | sync       |
| `client.token.holder`  | GET `/api/token/{tokenAddress}/holder`  | sync       |

### Recipe: List holders + read one

```ts
const holders = await client.token.holders({
  params: { tokenAddress },
  query: { page: { limit: 10, offset: 0 } },
});

const holder = await client.token.holder({
  params: { tokenAddress },
  query: { holderAddress: walletAddress },
});

if (holder.data.holder) {
  console.log(holder.data.holder.account.id); // checksummed address
  console.log(holder.data.holder.balance); // current balance
  console.log(holder.data.holder.available); // balance − frozen
}
```

### When you'd build a screen for this

- **Bond Dashboard → Bondholders tab** uses `token.holders`.
- **Bond Dashboard → Top Investors pie chart** uses `token.holders({ query: { page: { limit: 5 } } })`.
- **Investor Asset detail → My balance** uses `token.holder({ query: { holderAddress: me } })`.

---

## token.documents (`client.token.documents.*`)

### Overview

S3-backed document store attached to a token (prospectus, audits, etc.). Two-step upload: issue a presigned URL, PUT the bytes directly to S3, then call `confirmUpload` so the document appears in DALP. Versioned per `groupId` — replacing a document keeps the old version queryable but flags `isLatest: false`.

### Methods

| Method                                  | Path                                                                | Idempotency | Sync/async |
| --------------------------------------- | ------------------------------------------------------------------- | ----------- | ---------- |
| `client.token.documents.list`           | GET `/api/token/{tokenAddress}/documents`                           | n/a         | sync       |
| `client.token.documents.getUploadUrl`   | POST `/api/token/{tokenAddress}/documents/upload-url`               | optional    | sync       |
| `client.token.documents.confirmUpload`  | POST `/api/token/{tokenAddress}/documents/confirm-upload`           | required    | sync       |
| `client.token.documents.getDownloadUrl` | GET `/api/token/{tokenAddress}/documents/{documentId}/download-url` | n/a         | sync       |
| `client.token.documents.delete`         | DELETE `/api/token/{tokenAddress}/documents/{documentId}`           | required    | sync       |

### Recipe: Upload a document (full chain)

```ts
// 1. Get a presigned PUT URL
const upload = await client.token.documents.getUploadUrl({
  params: { tokenAddress },
  body: {
    documentType: "reserve_audit",
    fileName: "reserve-audit-2026Q1.pdf",
    fileSize: bytes.byteLength,
    mimeType: "application/pdf",
    visibility: "public", // "public" | "restricted"
    title: "Reserve Audit 2026 Q1",
  },
});

// 2. PUT the bytes directly to S3 (browser or server)
await fetch(upload.data.uploadUrl, {
  method: upload.data.method, // "PUT"
  body: bytes,
  headers: { "Content-Type": "application/pdf" },
});

// 3. Confirm to DALP — this is when the doc becomes listable
const confirmed = await client.token.documents.confirmUpload({
  params: { tokenAddress },
  body: {
    objectKey: upload.data.objectKey,
    documentType: "reserve_audit",
    fileName: "reserve-audit-2026Q1.pdf",
    fileSize: bytes.byteLength,
    mimeType: "application/pdf",
    visibility: "public",
    title: "Reserve Audit 2026 Q1",
    description: "Independent quarterly attestation",
  },
});

console.log(confirmed.data.versionNumber); // 1
console.log(confirmed.data.isLatest); // true
```

### Recipe: Replace a document (versioning)

```ts
// Upload v2 via same getUploadUrl + S3 PUT...

const replacement = await client.token.documents.confirmUpload({
  params: { tokenAddress },
  body: {
    objectKey: replacementUpload.data.objectKey,
    documentType: "reserve_audit",
    fileName: "reserve-audit-2026Q2.pdf",
    fileSize: bytes.byteLength,
    mimeType: "application/pdf",
    visibility: "public",
    title: "Reserve Audit 2026 Q2",
    replaceGroupId: previousDocument.data.groupId, // links the versions
  },
});

console.log(replacement.data.groupId === previousDocument.data.groupId); // true
console.log(replacement.data.versionNumber); // 2
console.log(replacement.data.isLatest); // true
```

### Recipe: Get download URL / delete

```ts
const download = await client.token.documents.getDownloadUrl({
  params: { tokenAddress, documentId },
});
window.location.href = download.data.downloadUrl; // pre-signed S3 GET

await client.token.documents.delete({
  params: { tokenAddress, documentId },
});
```

Calling `getDownloadUrl` on a non-latest version of a versioned document throws — only the latest is downloadable.

### Common errors (documents)

- **422** — `fileSize: 0` or unsupported `mimeType` (the API rejects executable extensions even when the mime says PDF).
- **403** — `visibility: "restricted"` document with a caller lacking the right role.

### When you'd build a screen for this

- **Bond Dashboard → Documents tab** uses `documents.list` + `documents.getDownloadUrl`.
- Document upload UI is **out of scope for the v1 reference apps in this repo** — the SDK supports it, the v1 apps don't include it yet. If you need it, this recipe is the canonical wire-up.

---

## token.events (`client.token.events`)

### Overview

Per-token paginated event log from the indexer (transfers, mints, burns, approvals, role grants, role revokes, freezes, pause/unpause, every state-change ABI event).

### Methods

| Method                | Path                                   | Sync/async |
| --------------------- | -------------------------------------- | ---------- |
| `client.token.events` | GET `/api/token/{tokenAddress}/events` | sync       |

### Recipe: Recent events for a token

```ts
const events = await client.token.events({
  params: { tokenAddress },
  query: { page: { limit: 20, offset: 0 } },
});

for (const event of events.data) {
  console.log(event.eventType, event.blockTimestamp, event.payload);
}
```

### When you'd build a screen for this

- **Bond Dashboard → Statistics chart** (Yield / Supply / Volume) renders time-series from `token.events({ query: { sortBy: "blockTimestamp", sortDirection: "desc" } })`.
- **Bond Dashboard → Investors → Transfers** uses `token.events({ query: { filters: [{ id: "eventType", operator: "eq", value: "Transfer" }] } })`.

---

## token.actions (`client.token.actions`)

### Overview

Per-token feed of indexed _actions_ — XvP approvals, maturity redemption requests, claim-yield requests, pending mutations. Distinct from the events log (which is raw on-chain events) — actions are higher-level user-facing operations.

### Methods

| Method                 | Path                                    | Sync/async |
| ---------------------- | --------------------------------------- | ---------- |
| `client.token.actions` | GET `/api/token/{tokenAddress}/actions` | sync       |

### Recipe

```ts
const actions = await client.token.actions({
  params: { tokenAddress },
  query: { page: { limit: 10, offset: 0 } },
});
```

For the cross-token action queue (XvP across multiple assets, maturity, yield) use the top-level `client.actions.*` namespace instead — see [`operational.md`](operational.md).

---

## token.stats.\* (`client.token.statsBondStatus`, etc.)

### Overview

Time-series + aggregate projections for dashboards. All stats endpoints return shapes designed for direct chart-binding.

### Methods

| Method                                 | Path                                                      | Idempotency | Sync/async |
| -------------------------------------- | --------------------------------------------------------- | ----------- | ---------- |
| `client.token.statsBondStatus`         | GET `/api/token/{tokenAddress}/stats/bond-status`         | n/a         | sync       |
| `client.token.statsCollateralRatio`    | GET `/api/token/{tokenAddress}/stats/collateral-ratio`    | n/a         | sync       |
| `client.token.statsTotalSupply`        | GET `/api/token/{tokenAddress}/stats/total-supply`        | n/a         | sync       |
| `client.token.statsSupplyChanges`      | GET `/api/token/{tokenAddress}/stats/supply-changes`      | n/a         | sync       |
| `client.token.statsVolume`             | GET `/api/token/{tokenAddress}/stats/volume`              | n/a         | sync       |
| `client.token.statsWalletDistribution` | GET `/api/token/{tokenAddress}/stats/wallet-distribution` | n/a         | sync       |
| `client.token.statsYieldCoverage`      | GET `/api/token/{tokenAddress}/stats/yield-coverage`      | n/a         | sync       |
| `client.token.statsYieldDistribution`  | GET `/api/token/{tokenAddress}/stats/yield-distribution`  | n/a         | sync       |

### Recipe: 7-day total supply history

```ts
const totalSupply = await client.token.statsTotalSupply({
  params: { tokenAddress },
  query: { days: 7 },
});

for (const point of totalSupply.data.totalSupplyHistory) {
  console.log(point.t, point.totalSupply); // timestamp + supply
}
```

### Recipe: Wallet distribution buckets

```ts
const distribution = await client.token.statsWalletDistribution({
  params: { tokenAddress },
});

console.log(distribution.data.totalHolders);
for (const bucket of distribution.data.buckets) {
  console.log(bucket.label, bucket.count, bucket.percentage);
}
```

### When you'd build a screen for this

- **Bond Dashboard → Overview → Supply panel + Statistics chart** uses `statsTotalSupply`, `statsSupplyChanges`, `statsVolume`.
- **Bond Dashboard → Right rail → Wallet distribution pie** uses `statsWalletDistribution`.

---

## Reference apps cross-link summary

| Reference app screen                   | Token methods used                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Issuer Reserve Token wizard            | client-side state only — compliance module choices bundle into `token.create` body                           |
| Issuer Token Setup → Create & Deploy   | `token.create`                                                                                               |
| Issuer Bond Dashboard header           | `token.read`, `token.metadata`, `token.features`                                                             |
| Issuer Bond Dashboard supply/stats     | `token.statsTotalSupply`, `token.statsSupplyChanges`, `token.statsVolume`, `token.statsWalletDistribution`   |
| Issuer Bond Dashboard Bondholders      | `token.holders`                                                                                              |
| Issuer Bond Dashboard Transfers/Events | `token.events`                                                                                               |
| Issuer mutation actions                | `token.mint`, `token.transfer`, `token.freezeAddress`, `token.freezePartial`, `token.pause`, `token.unpause` |
| Investor Browse                        | `token.list`                                                                                                 |
| Investor Asset detail                  | `token.read`, `token.metadata`, `token.holder`                                                               |
| Investor Transfer                      | `token.transfer`                                                                                             |
