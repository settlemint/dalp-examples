# `client.user.*` — Users + KYC handshake

The user + KYC chain is the **DALP moment** — the proof that ERC-3643 compliance is enforced end-to-end. An investor submits a KYC profile version, an issuer (or anyone with the right role) approves it, and approval triggers the on-chain workflow that registers the identity claim. With the claim in place, the investor can hold and transfer compliant tokens. Without it, every compliant token's transfer hooks 409 the operation.

This file covers the full chain — user reads, the KYC workflow, document upload, and the `system.identity.*` hand-off that lands the claim on-chain.

---

## user (`client.user.*`) — core reads

### Overview

Read the current authenticated user (`me`), update profile, list users with paginated filters, find users by id or wallet, and read per-user aggregates (assets held, recent events, stats). The `me` endpoint is the canonical "who am I?" call after sign-in — its response carries the user id, current organization id, role bitmap, and KYC status pointer.

### Methods

| Method                            | Path                                   | Idempotency | Sync/async |
| --------------------------------- | -------------------------------------- | ----------- | ---------- |
| `client.user.me`                  | GET `/api/user/me`                     | n/a         | sync       |
| `client.user.update`              | PATCH `/api/user/me`                   | optional    | sync       |
| `client.user.search`              | GET `/api/user/search`                 | n/a         | sync       |
| `client.user.list`                | GET `/api/user/list`                   | n/a         | sync       |
| `client.user.adminList`           | GET `/api/user/list/admins`            | n/a         | sync       |
| `client.user.readByUserId`        | GET `/api/user/by-id/{userId}`         | n/a         | sync       |
| `client.user.readByWallet`        | GET `/api/user/by-wallet/{wallet}`     | n/a         | sync       |
| `client.user.stats`               | GET `/api/user/stats`                  | n/a         | sync       |
| `client.user.statsGrowthOverTime` | GET `/api/user/stats/growth-over-time` | n/a         | sync       |
| `client.user.statsUserCount`      | GET `/api/user/stats/user-count`       | n/a         | sync       |
| `client.user.assets`              | GET `/api/user/assets`                 | n/a         | sync       |
| `client.user.events`              | GET `/api/user/events`                 | n/a         | sync       |
| `client.user.create`              | POST `/api/user/create`                | required    | async      |
| `client.user.createWallet`        | POST `/api/user/create-wallet`         | required    | async      |

Plus the admin surface — `adminGetSecurity`, `adminRevokeSession`, `adminRevokeAllSessions`, `adminResetMfa`, `adminTriggerPasswordReset` — for org-admin operations only.

### Recipe: Who am I, what do I hold

```ts
const me = await client.user.me({});
console.log(me.data.id); // internal user id
console.log(me.data.email);
console.log(me.data.participantId); // links to OnchainID
console.log(me.data.kycStatus); // null | "pending" | "approved" | "rejected"

const assets = await client.user.assets({
  query: { page: { limit: 20, offset: 0 } },
});
for (const balance of assets.data) {
  console.log(balance.token.symbol, balance.balance);
}
```

### Recipe: Find a user by wallet (issuer-side admin)

```ts
const user = await client.user.readByWallet({
  params: { wallet: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" },
});
```

Used by the issuer KYC review screen to surface the submitter's profile + wallet history before approval.

### Recipe: Create a user with wallet + identity (issuer-driven)

```ts
const created = await client.user.create({
  body: {
    email: "investor@example.com",
    name: "Investor Example",
    countryCode: "840",
    walletVerification,
  },
});
// created.data.userId, created.data.walletAddress, created.data.statusUrl
```

Requires `identityManager` role. Async — poll `statusUrl` or subscribe to the matching webhook.

### Common errors (user reads)

| Code                      | Status | When                                     | What to do                                                         |
| ------------------------- | ------ | ---------------------------------------- | ------------------------------------------------------------------ |
| `UNAUTHORIZED`            | 401    | No session / no API key                  | Send to sign-in                                                    |
| `X_PARTICIPANT_FORBIDDEN` | 404    | Trying to read a user outside your org   | Treat as "not found"; DALP doesn't disclose cross-tenant existence |
| `VALIDATION_FAILED`       | 422    | Invalid wallet hex, malformed pagination | Validate before calling                                            |

### When you'd build a screen for this

- **Both apps' authenticated shell** uses `user.me` to gate every route after sign-in.
- **Investor Holdings dashboard** uses `user.assets`.
- **Investor Activity feed** uses `user.events`.
- **Issuer "Add user" admin action (out of scope for v1)** would use `user.create`.

---

## user.kyc.profile (`client.user.kyc.profile.read`)

### Overview

Summary read of a user's KYC profile — points to the latest approved version and the latest draft/submitted version. Used to render the KYC status badge in both apps and to route the investor to the right next step (draft, submit, view rejection, request changes).

### Method

| Method                         | Path                             | Sync/async |
| ------------------------------ | -------------------------------- | ---------- |
| `client.user.kyc.profile.read` | GET `/api/kyc-profiles/{userId}` | sync       |

### Recipe: Read my KYC status

```ts
const me = await client.user.me({});
const profile = await client.user.kyc.profile.read({
  params: { userId: me.data.id },
});

console.log(profile.data.approvedVersionId); // null | versionId
console.log(profile.data.latestVersionId); // null | versionId
console.log(profile.data.latestStatus);
//   "draft" | "submitted" | "approved" | "rejected" | "changes_requested"
```

### When you'd build a screen for this

- **Investor header KYC badge** uses this to show Pending / Approved / Rejected pill.
- **Investor signup flow** branches off `latestStatus` to decide whether to show the KYC form, the "waiting for approval" state, or the rejection reason.

---

## user.kyc.versions (`client.user.kyc.versions.*`)

### Overview

KYC profiles are _versioned_ — each submission, approval, rejection, and update-request creates a new immutable version row. The version chain is the audit trail; mutations always target a specific version id, never the bare profile.

### Methods

| Method                            | Path                                       | Idempotency | Sync/async |
| --------------------------------- | ------------------------------------------ | ----------- | ---------- |
| `client.user.kyc.versions.list`   | GET `/api/kyc-profiles/{userId}/versions`  | n/a         | sync       |
| `client.user.kyc.versions.create` | POST `/api/kyc-profiles/{userId}/versions` | required    | sync       |

### Recipe: Investor starts a new KYC draft

```ts
const me = await client.user.me({});

const draft = await client.user.kyc.versions.create({
  params: { userId: me.data.id },
  body: {
    // initial draft fields — full form is filled via version.update later
    firstName: "Ada",
    lastName: "Example",
    dob: "1985-04-12", // ISO date
    country: "DE", // ISO code
    walletVerification,
  },
});

const versionId = draft.data.id;
```

### Recipe: Issuer paginates the pending review queue

`versions.list` takes a **flat** input (no `params` / `query` / `filters` envelope) and returns `{ items, total, limit, offset }` (no `.data`). `userId` is an optional field in the same flat object; `statuses` is a flat string array:

```ts
const queue = await client.user.kyc.versions.list({
  userId, // optional — any user the caller can read
  statuses: ["submitted", "under_review"],
  limit: 25,
  offset: 0,
  orderDirection: "desc",
});

for (const version of queue.items) {
  console.log(version.id, version.status, version.submittedAt);
}
console.log(queue.total);
```

> The submission-review queue on the issuer side queries this list across all users (`kyc.versions.list` per user) — the dapp / reference app holds the iteration. There is no single cross-user "incoming queue" endpoint; build it client-side via a v2 list of users + per-user version list.

### When you'd build a screen for this

- **Investor KYC submission form** uses `versions.create` → `version.update` → `version.submit`.
- **Issuer KYC Review queue** uses `versions.list({ userId, statuses: ["submitted", "under_review"], limit, offset, orderDirection })` per user surfaced in the user list.

---

## user.kyc.version (`client.user.kyc.version.*`)

> **Field names are contract-verified.** The real KYC version object exposes exactly:
> `firstName`, `lastName`, `dob` (ISO date), `country` (ISO code),
> `residencyStatus` (`"resident" | "non_resident" | "dual_resident" | "unknown"`), and `nationalId`.
> The review/status fields are `status`, `reviewNotes`, `rejectionReason`, `documentsCount`, `canReview`.
> There is no `fullName`, `dateOfBirth`, `countryCode`, `nationality`, or `address`/`city`/`postalCode`.
> [`apps/issuer/src/lib/kyc.ts`](../apps/issuer/src/lib/kyc.ts) mined these from the real oRPC contract and is the
> source of truth; earlier revisions of this doc paraphrased the shapes and were wrong.

### Overview

Per-version operations — read full version data, update a draft, submit for review, approve, reject, request changes. **Approval is the DALP moment**: it kicks off the workflow that lands a `KYC_APPROVED` claim on the holder's OnchainID, which the ERC-3643 transfer hooks read on every transfer.

### Methods

| Method                                  | Path                                                        | Idempotency | Sync/async |
| --------------------------------------- | ----------------------------------------------------------- | ----------- | ---------- |
| `client.user.kyc.version.read`          | GET `/api/kyc-profile-versions/{versionId}`                 | n/a         | sync       |
| `client.user.kyc.version.update`        | PATCH `/api/kyc-profile-versions/{versionId}`               | optional    | sync       |
| `client.user.kyc.version.submit`        | POST `/api/kyc-profile-versions/{versionId}/submit`         | required    | sync       |
| `client.user.kyc.version.approve`       | POST `/api/kyc-profile-versions/{versionId}/approve`        | required    | **async**  |
| `client.user.kyc.version.reject`        | POST `/api/kyc-profile-versions/{versionId}/reject`         | required    | sync       |
| `client.user.kyc.version.requestUpdate` | POST `/api/kyc-profile-versions/{versionId}/request-update` | required    | sync       |

### Recipe: Investor fills + submits a draft

```ts
// 1. Update the draft (PATCH — call as many times as needed)
await client.user.kyc.version.update({
  params: { versionId },
  body: {
    firstName: "Ada",
    lastName: "Example",
    dob: "1985-04-12", // ISO date
    country: "DE", // ISO code
    residencyStatus: "resident", // "resident" | "non_resident" | "dual_resident" | "unknown"
    nationalId: "L01X00T47",
  },
});

// 2. Submit for review (transitions status: draft → submitted)
await client.user.kyc.version.submit({
  params: { versionId },
  body: { walletVerification, idempotencyKey },
});
```

### Recipe: Issuer approves — the DALP moment

```ts
const approved = await client.user.kyc.version.approve({
  params: { versionId },
  body: {
    reviewNotes: "ID + proof of address verified against the sanctions list.", // optional
    walletVerification, // { secretVerificationCode: <pincode>, verificationType: "PINCODE" }
    idempotencyKey,
  },
});

// Approve is **async** — the response carries a statusUrl. Approval
// kicks off a workflow that:
//   1. Locks the version (status: "approved")
//   2. Issues a KYC_APPROVED claim on the holder's OnchainID (via system.identity.* writes)
//   3. Emits a token.compliance.claim-issued webhook event
// Until the workflow completes, the holder's compliance-gated transfers
// will still 409 — wait for the statusUrl to reach "completed" before
// telling the investor "you can transfer now".
const status = await pollStatus(approved.data.statusUrl);
```

### Recipe: Issuer rejects with a reason

```ts
await client.user.kyc.version.reject({
  params: { versionId },
  body: {
    rejectionReason:
      "Document quality insufficient — re-upload proof of address with all four corners visible.",
    walletVerification,
    idempotencyKey,
  },
});
// Investor sees the reason on their KYC status badge + can create a new
// version (versions.create) to resubmit.
```

### Recipe: Issuer requests specific changes (creates a draft)

```ts
const requested = await client.user.kyc.version.requestUpdate({
  params: { versionId },
  body: {
    requiredFields: ["country", "nationalId"],
    reason: "Nationality details do not match the proof of residence document.",
    walletVerification,
    idempotencyKey,
  },
});
// A new draft version is created automatically with the issuer's notes
// attached. The investor edits it via version.update and submits again.
console.log(requested.data.newDraftVersionId);
```

### Common errors (KYC workflow)

| Code                         | Status | When                                                                                | What to do                                            |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `KYC_INVALID_TRANSITION`     | 409    | Approving an already-approved version, or submitting a draft that's been superseded | Surface the current `latestStatus` and refresh the UI |
| `KYC_INSUFFICIENT_ROLES`     | 403    | Caller lacks `kycReviewer` / `kycApprover` role                                     | Don't auto-retry; route to admin                      |
| `KYC_VALIDATION_FAILED`      | 422    | Missing required fields on submit (e.g. no `firstName` / `lastName`)                | Inspect `error.details` for the missing field paths   |
| `WALLET_VERIFICATION_FAILED` | 403    | Stale or replayed `walletVerification`                                              | Re-prompt for pincode / passkey                       |

### When you'd build a screen for this

- **Investor KYC submission form** uses `version.update` (live form save) + `version.submit`.
- **Issuer KYC Review detail** uses `version.read` + Approve / Reject / Request Update CTAs.
- **The DALP demo handshake** is exactly `investor.submit → issuer.approve → investor.transfer succeeds`.

---

## user.kyc.documents (`client.user.kyc.documents.*`)

### Overview

S3-backed document store attached to a KYC version (proof of identity, proof of address, etc.). DALP encrypts documents server-side before object storage — the upload path goes _through_ DAPI, not direct-to-S3. This is the security boundary that separates KYC docs from token documents.

### Methods

| Method                                     | Path                                                                            | Idempotency | Sync/async |
| ------------------------------------------ | ------------------------------------------------------------------------------- | ----------- | ---------- |
| `client.user.kyc.documents.list`           | GET `/api/kyc-profile-versions/{versionId}/documents`                           | n/a         | sync       |
| `client.user.kyc.documents.confirmUpload`  | POST `/api/kyc-profile-versions/{versionId}/documents/confirm`                  | required    | sync       |
| `client.user.kyc.documents.delete`         | DELETE `/api/kyc-profile-versions/{versionId}/documents/{documentId}`           | required    | sync       |
| `client.user.kyc.documents.getDownloadUrl` | GET `/api/kyc-profile-versions/{versionId}/documents/{documentId}/download-url` | n/a         | sync       |

### Recipe: Upload a KYC document

```ts
// Encrypted POST through DAPI — payload IS the bytes (different from token.documents,
// which goes direct to S3 via a presigned URL).
const uploaded = await client.user.kyc.documents.confirmUpload({
  params: { versionId },
  body: {
    documentType: "proof_of_identity", // | "proof_of_address" | "selfie" | ...
    fileName: "passport.pdf",
    mimeType: "application/pdf",
    contents: base64FileBytes, // base64-encoded bytes
    walletVerification,
    idempotencyKey,
  },
});

console.log(uploaded.data.id); // document id
console.log(uploaded.data.documentType);
```

### Recipe: Issuer downloads to review

```ts
const url = await client.user.kyc.documents.getDownloadUrl({
  params: { versionId, documentId },
});
window.location.href = url.data.downloadUrl; // pre-signed S3 GET, server-side decrypt on access
```

### When you'd build a screen for this

- **Reference apps in v1: out of scope** — the v1 KYC form is fields-only, no document upload. The SDK supports it; the docs above are the canonical wire-up when you add the upload UI later.

---

## user.kyc.actionRequest (`client.user.kyc.actionRequest.fulfill`)

### Overview

Issuer-side workflow for action requests attached to a KYC version (e.g., a request to re-issue a claim, lift a freeze, request a clarification). Fulfillment closes the request and triggers any downstream workflow.

### Method

| Method                                  | Path                                                | Idempotency | Sync/async |
| --------------------------------------- | --------------------------------------------------- | ----------- | ---------- |
| `client.user.kyc.actionRequest.fulfill` | POST `/api/kyc-action-requests/{requestId}/fulfill` | required    | sync       |

### Recipe

```ts
await client.user.kyc.actionRequest.fulfill({
  params: { requestId },
  body: {
    resolution: "approved",
    note: "Lifted Q3-2026 freeze per AML review.",
    walletVerification,
    idempotencyKey,
  },
});
```

---

## system.identity (`client.system.identity.*`)

### Overview

The on-chain identity claim layer. KYC approval triggers a workflow that ultimately calls into this namespace to register a claim on the holder's OnchainID. Most apps don't call these directly — they're surface area for issuer admins and compliance officers who need to read or correct identity state outside the normal KYC flow.

### Common methods (verify against your SDK type definitions)

| Method                                    | Purpose                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `client.system.identity.list`             | List identities scoped to the org                                                                |
| `client.system.identity.read`             | Read a single identity by id or wallet                                                           |
| `client.system.identity.register`         | Self-register the caller's wallet as an identity (creates OnchainID)                             |
| `client.system.identity.registerExisting` | Wire an existing OnchainID to a user (admin migration tool)                                      |
| `client.system.identity.recover`          | Initiate identity recovery for a lost wallet (see `client.identityRecovery.*` for the full flow) |

### Recipe: Investor self-registers an identity

```ts
// First time a wallet wants to hold a compliant token, the OnchainID has to exist.
// Most flows trigger this implicitly via KYC approval, but for direct self-registration:
const registered = await client.system.identity.register({
  body: { walletVerification, idempotencyKey },
});
console.log(registered.data.identityAddress);
```

### When you'd build a screen for this

- **Reference apps in v1: not directly surfaced.** The identity claim creation happens implicitly via KYC approval. If you need an admin surface to manage identities outside the KYC flow, see `client.identityRecovery.*` ([`operational.md`](operational.md)) for the user-facing recovery surface and `client.system.identity.*` for the admin read surface.

---

## The full KYC handshake — one canonical recipe

```ts
// =============================================================
// INVESTOR (apps/investor) — signed in, has a wallet + OnchainID
// =============================================================

// 1. Create a draft KYC version
const me = await investorClient.user.me({});
const draft = await investorClient.user.kyc.versions.create({
  params: { userId: me.data.id },
  body: { walletVerification: investorVerification },
});
const versionId = draft.data.id;

// 2. Fill the draft (this can be split across many UI saves)
await investorClient.user.kyc.version.update({
  params: { versionId },
  body: {
    firstName: "Ada",
    lastName: "Example",
    dob: "1985-04-12", // ISO date
    country: "DE", // ISO code
    residencyStatus: "resident", // "resident" | "non_resident" | "dual_resident" | "unknown"
    nationalId: "L01X00T47",
  },
});

// 3. Submit for review
await investorClient.user.kyc.version.submit({
  params: { versionId },
  body: { walletVerification: investorVerification, idempotencyKey: uuid() },
});

// =============================================================
// ISSUER (apps/issuer) — has kycReviewer role
// =============================================================

// 4. The version appears in the issuer's review queue
const queue = await issuerClient.user.kyc.versions.list({
  userId: me.data.id,
  statuses: ["submitted", "under_review"],
  limit: 25,
  offset: 0,
  orderDirection: "desc",
});

// 5. Issuer reads + approves — THIS is where the on-chain claim gets minted
const approved = await issuerClient.user.kyc.version.approve({
  params: { versionId },
  body: { walletVerification: issuerVerification, idempotencyKey: uuid() },
});

// 6. Wait for the on-chain workflow to land the KYC_APPROVED claim
await pollStatus(approved.data.statusUrl);

// =============================================================
// INVESTOR — can now hold + transfer compliant tokens
// =============================================================

await investorClient.token.transfer({
  params: { tokenAddress: someCompliantToken },
  body: {
    transfers: [{ to: counterparty, amount: "100" }],
    walletVerification: investorVerification,
  },
});
// ↑ Without step 6 having completed, this would 409 with
//   TRANSFER_BLOCKED_BY_COMPLIANCE because the IdentityAllowList /
//   country compliance modules read the claim from the OnchainID.
```

This six-step handshake is the spine of the signup + dashboard flows in the reference apps. It's the single most important thing the SDK enables — render it cleanly and the rest of DALP follows.
