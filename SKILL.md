---
name: dalp-sdk
description: The @settlemint/dalp-sdk reference — every namespace, idempotency, polling, errors, webhooks, serializers. Use this when building issuer or investor apps on DALP.
---

# DALP SDK — `@settlemint/dalp-sdk`

A fully typed TypeScript client for the **Digital Asset Lifecycle Platform** (DALP) — SettleMint's compliance-first tokenization platform built on ERC-3643 / SMART. Issuance, compliance, custody, settlement, and servicing run through one API surface against one on-chain registry.

This file is the LLM-consumable spec. Paste it into Claude, Cursor, or any agent and it has every namespace, every idempotency rule, every error shape, every recipe. Long-tail per-domain detail lives in `references/<domain>.md` — open them on demand.

> **Verify against your SDK version**: the SDK evolves. When the docs name a specific method, field, or error code, the SDK type definitions are the source of truth. If a name doesn't match what your installed `/dalp-sdk` exports, trust the SDK and treat the docs as out of date.

> **Source-of-truth note for the agent**: every code example here is mined from real tests in the SDK's canonical test fixtures. If a method isn't in this file, it doesn't exist in the SDK — go to `docs.settlemint.com` (see [What's NOT in the SDK](#whats-not-in-the-sdk)).

---

## Table of contents

1. [Install + quick start](#install--quick-start)
2. [Three client factories — which one when](#three-client-factories--which-one-when)
3. [Namespace map](#namespace-map)
4. [Cross-cutting: Auth flow](#cross-cutting-auth-flow)
5. [Cross-cutting: Idempotency-key discipline](#cross-cutting-idempotency-key-discipline)
6. [Cross-cutting: Polling async mutations](#cross-cutting-polling-async-mutations)
7. [Cross-cutting: Error shapes](#cross-cutting-error-shapes)
8. [Cross-cutting: Webhook verification](#cross-cutting-webhook-verification)
9. [Cross-cutting: Serializers (bigint, decimal, timestamp)](#cross-cutting-serializers)
10. [Domain references](#domain-references)
11. [What's NOT in the SDK](#whats-not-in-the-sdk)
12. [Conventions used in this file](#conventions-used-in-this-file)

---

## Install + quick start

```bash
bun add @settlemint/dalp-sdk
# or: npm install @settlemint/dalp-sdk
```

```ts
import { createDalpClient } from "@settlemint/dalp-sdk";

const dalp = createDalpClient({
  url: "https://your-dalp.example.com",
  apiKey: "sm_dalp_…",
  organizationId: "org-uuid", // optional; required for multi-org accounts
});

// Every method is typed. The TS server has full input + output schemas.
const system = await dalp.system.read({});
const tokens = await dalp.token.list({ query: {} });
```

**`url`** is the DALP API base — no trailing `/api`. Get it from your DALP deployment (self-hosted, BYOC, or SettleMint-hosted).
**`apiKey`** is created in the DALP dashboard: Settings → API keys → Create. Format: `sm_dalp_…`. Server-side only; never ship in browser bundles.
**`organizationId`** sent as `x-organization-id` when set. Required for any user with access to more than one organization.

---

## Three client factories — which one when

The SDK ships three factories. Pick by the credential you have:

| Factory                    | Credentials it accepts                                                 | What it returns                                                                                            | When to use                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `createDalpClient`         | `apiKey` (server-side only)                                            | A DAPI-only client (`dalp.token`, `dalp.system`, …)                                                        | Backend → DALP server calls with a long-lived API key. Issuer admin ops, server functions in TanStack Start, cron jobs, webhook receivers. |
| `createDalpAuthClient`     | `apiKey` OR `sessionToken` OR `cookie`/`cookieStore` — **exactly one** | A Better Auth client (`auth.signIn`, `auth.signUp`, `auth.apiKey`, `auth.organization`, `auth.passkey`, …) | Operations that go through Better Auth (signup, OTP verify, organization management, API key issuance, device flow).                       |
| `createDalpPlatformClient` | Any of the above                                                       | `{ dapi, auth, cookieStore }` — bundled DAPI + Better Auth with shared cookie store                        | Full-stack apps (issuer / investor portals) where a Node server does signup and then makes DAPI calls on behalf of that session.           |

The platform client is what the two reference apps use server-side. The `cookieStore` it owns automatically forwards Better Auth cookies into subsequent DAPI calls, so the moment a user signs up, their session can read their own tokens.

```ts
import { createDalpPlatformClient } from "@settlemint/dalp-sdk";

const platform = createDalpPlatformClient({ url: process.env.DALP_API_URL! });

await platform.auth.signUp.email({
  email: "ada@example.com",
  password: "Pa55word!",
  name: "Ada Example",
});

// `platform.dapi` now carries the session cookie, so this is scoped to Ada:
const me = await platform.dapi.user.me({});
```

For multi-user request handling on a server, create a **per-request** platform client and pass the inbound `cookie` header:

```ts
function dalpForRequest(cookieHeader: string) {
  return createDalpPlatformClient({
    url: process.env.DALP_API_URL!,
    organizationId: process.env.DALP_ORG_ID,
    cookie: cookieHeader,
  });
}
```

> ⚠️ **Configure exactly one credential source per auth client.** Mixing `apiKey` + `sessionToken` + `cookie`/`cookieStore` throws a `DalpSdkError` with category `sdk.configuration`. The auth client cannot resolve which credential to use.

---

## Namespace map

All v1 namespaces (mutations + classic queries) — exposed by every factory's DAPI client:

| Namespace          | What it does                                                                                                                      | Reference                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `account`          | Current user account, balances rollup, portfolio                                                                                  | [account-reads.md](references/account-reads.md)                                                            |
| `actions`          | Pending / upcoming / completed XvP, maturity, yield actions                                                                       | [operational.md](references/operational.md)                                                                |
| `addons`           | Fixed yield schedules, fixed treasury yield, maturity redemption                                                                  | [operational.md](references/operational.md)                                                                |
| `admin`            | Org-level admin operations                                                                                                        | [system-admin.md](references/system-admin.md)                                                              |
| `contacts`         | Address book                                                                                                                      | [account-reads.md](references/account-reads.md)                                                            |
| `exchangeRates`    | FX / oracle rates                                                                                                                 | [operational.md](references/operational.md)                                                                |
| `externalToken`    | Imported tokens not deployed via DALP                                                                                             | [operational.md](references/operational.md)                                                                |
| `identityRecovery` | Recover a lost OnchainID                                                                                                          | [operational.md](references/operational.md)                                                                |
| `search`           | Cross-resource search                                                                                                             | [account-reads.md](references/account-reads.md)                                                            |
| `settings`         | Asset-type templates, jurisdiction tables, platform config                                                                        | [system-admin.md](references/system-admin.md)                                                              |
| `system`           | System-level reads + `system.identity` / `system.claimTopics` / `system.trustedIssuers`                                           | [system-admin.md](references/system-admin.md), [user-kyc.md](references/user-kyc.md) (identity sub-domain) |
| `token`            | Read / list / create / mint / burn / transfer / approve + `compliance` / `holders` / `documents` / `stats` / `events` sub-domains | [token.md](references/token.md)                                                                            |
| `transaction`      | Transaction history, status reads                                                                                                 | [account-reads.md](references/account-reads.md)                                                            |
| `user`             | User reads + `user.kyc.*` (profile, profileVersions, profileVersionDocument)                                                      | [user-kyc.md](references/user-kyc.md)                                                                      |

v2-only namespaces (modern paginated queries + new domains):

| Namespace                                      | What it does                                                                                                | Reference                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `compliance`                                   | Compliance expression management                                                                            | [v2-advanced.md](references/v2-advanced.md) |
| `contracts`                                    | Deployed contract registry                                                                                  | [v2-advanced.md](references/v2-advanced.md) |
| `directory`                                    | Cross-org participant directory                                                                             | [v2-advanced.md](references/v2-advanced.md) |
| `historicalBalances`                           | Per-holder balance history                                                                                  | [v2-advanced.md](references/v2-advanced.md) |
| `monitoring.api.*` / `monitoring.blockchain.*` | API + blockchain telemetry. **README claims a flat `monitoring` namespace; v2 contract exposes it nested.** | [v2-advanced.md](references/v2-advanced.md) |
| `organization`                                 | Organization-level reads                                                                                    | [v2-advanced.md](references/v2-advanced.md) |
| `participants`                                 | Per-token participants registry                                                                             | [v2-advanced.md](references/v2-advanced.md) |
| `smartWallets`                                 | DALP-managed smart wallets                                                                                  | [v2-advanced.md](references/v2-advanced.md) |
| `webhooks`                                     | Webhook configuration                                                                                       | [operational.md](references/operational.md) |

> All v2 read endpoints follow the canonical paginated shape:
> `{ data, meta: { totalCount, offset, limit }, links: { self, next?, prev? } }`.
> Mutations still go through v1 namespaces.

---

## Cross-cutting: Auth flow

DALP's Better Auth deployment has the following plugins enabled (relevant to SDK callers):

| Plugin                         | What it adds to `auth.*`                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| **apiKey**                     | `auth.apiKey.list/create/delete` — issue & revoke `sm_dalp_…` keys                  |
| **passkey**                    | `auth.passkey.*` — WebAuthn registration + sign-in                                  |
| **organization**               | `auth.organization.create/list/setActive/inviteMember/addMember/removeMember`       |
| **twoFactor**                  | `auth.twoFactor.*` — TOTP / WebAuthn 2FA                                            |
| **deviceAuthorization**        | `auth.device.code/token/approve/deny` — RFC 8628 device flow                        |
| **admin**                      | `auth.admin.listUsers/createUser/removeUser/setRole` — org-admin only               |
| **walletAuth** (DALP-specific) | `auth.wallet.pincode/twoFactor/secretCodes/passkey.*` — protected wallet operations |

### Headers the SDK sets, that you can't override

| Header                                       | Source                           | Reserved                                           |
| -------------------------------------------- | -------------------------------- | -------------------------------------------------- |
| `x-api-key`                                  | `apiKey` config                  | ✅ — providing your own gets dropped               |
| `authorization: Bearer <token>`              | `sessionToken` config            | ✅                                                 |
| `cookie`                                     | `cookie` config or `cookieStore` | ✅ when cookie handling is active                  |
| `x-organization-id`                          | `organizationId` config          | ✅                                                 |
| `User-Agent: @settlemint/dalp-sdk/<version>` | hardcoded                        | ❌ — you can override with `headers["User-Agent"]` |

### Session handoff between web and Node

Two patterns:

**A) Bearer token** — Better Auth issues a short-lived bearer token after sign-in; pass it as `sessionToken`. Stateless, easy to log, but every call needs to send the token.

**B) Cookie store** — Better Auth sets HTTP-only cookies. Capture the inbound `cookie` header in your server handler, pass it to `createDalpPlatformClient({ cookie })`, and the SDK's `DalpCookieStore` round-trips `Set-Cookie` updates automatically (refresh tokens, session rotation, etc.).

```ts
// In a TanStack Start server function:
import { getRequest } from "@tanstack/react-start/server";

const platform = createDalpPlatformClient({
  url: process.env.DALP_API_URL!,
  cookie: getRequest().headers.get("cookie") ?? "",
});

// After the call, persist any rotated cookies back to the client:
const setCookieValue = platform.cookieStore.header;
```

### Multi-org scoping

If a user belongs to multiple orgs, every DAPI call needs `x-organization-id`. Either pass `organizationId` once to the factory, or change the active org via Better Auth:

```ts
await platform.auth.organization.setActive({ organizationId: "org-uuid" });
// Subsequent platform.dapi.* calls now run in that org's scope.
```

---

## Cross-cutting: Idempotency-key discipline

**Every mutation in DALP that touches an on-chain or workflow state needs an idempotency key.** Without one, a retry after a network hiccup might double-mint, double-transfer, or duplicate KYC submission.

### How to mint a key

UUIDv4 per logical operation:

```ts
import { randomUUID } from "node:crypto";

const idempotencyKey = randomUUID();

await dalp.token.transfers.create({
  body: { tokenAddress, to, amount, idempotencyKey },
});
```

### Per-request vs global

The SDK config has an `idempotencyKey` option:

```ts
const dalp = createDalpClient({
  url,
  apiKey,
  idempotencyKey: "req_abc", // ⚠️ sent on every request
});
```

> ⚠️ **Set this only when the entire client serves a single mutation.** Setting it globally and then making multiple distinct mutations means every mutation reuses the same key — DALP rejects all but the first as duplicates.

Best practice for multi-mutation workflows: leave the global config empty and pass `idempotencyKey` inside each mutation's `body`.

### Dedupe window

DALP de-duplicates by `idempotencyKey + organizationId + route` for **24 hours**. A retry within that window with the same key returns the original response (idempotent semantics). After 24 hours, the key is forgotten and a retry creates a new operation.

### Batched operations

For batch mutations (e.g., distributing a token to many holders), generate **distinct keys per row** but include a shared **prefix** for traceability:

```ts
const batchId = randomUUID();
for (const holder of holders) {
  await dalp.token.transfers.create({
    body: { tokenAddress, to: holder, amount, idempotencyKey: `${batchId}:${holder}` },
  });
}
```

If the batch retries mid-way, only un-applied rows execute.

---

## Cross-cutting: Polling async mutations

Most DALP write operations involve on-chain workflow steps and return **before** the on-chain side completes. Two ways to track completion:

### Pattern A: `statusUrl` polling

Async mutations return a payload with a `statusUrl`. Poll it until the status is terminal:

```ts
const created = await dalp.token.create({ body: { ... } });
// created.statusUrl is something like "/api/transactions/{id}"

const status = await pollStatus(created.statusUrl);
```

A minimal poller:

```ts
async function pollStatus(statusUrl: string, opts = { intervalMs: 1500, timeoutMs: 60_000 }) {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${process.env.DALP_API_URL}${statusUrl}`, {
      headers: { "x-api-key": process.env.DALP_API_KEY! },
    });
    const body = await res.json();
    if (body.status === "completed" || body.status === "failed") {
      return body;
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  throw new Error(`Status poll timed out at ${statusUrl}`);
}
```

Use backoff in production (1.5s → 3s → 6s → 12s, cap at 30s).

### Pattern B: Webhooks (preferred at scale)

Subscribe to webhook events instead of polling. See [Webhook verification](#cross-cutting-webhook-verification).

### When the indexer lags

Even after a mutation is "completed", the **indexer** that powers read endpoints can lag by a few seconds. If you call `dalp.token.read({ tokenAddress })` immediately after `dalp.token.create`, the read may 404. Strategy:

- For UI: optimistic-update from the create response, then re-fetch with TanStack Query / SWR.
- For server scripts: poll the read endpoint with the same backoff strategy.

---

## Cross-cutting: Error shapes

### `DalpSdkError`

The SDK throws `DalpSdkError` for every failed call. It extends `ORPCError` and carries fields the UI can render directly:

```ts
import { DalpSdkError } from "@settlemint/dalp-sdk";

try {
  await dalp.token.create({ body: { ... } });
} catch (error) {
  if (error instanceof DalpSdkError) {
    console.log(error.id);          // "DALP-12345" — public, stable error id
    console.log(error.category);    // "compliance" | "validation" | "auth" | …
    console.log(error.status);      // 401 | 403 | 409 | 422 | 500 …
    console.log(error.retryable);   // boolean — safe to retry?
    console.log(error.message);     // short title
    console.log(error.why);         // 1-sentence cause
    console.log(error.fix);         // 1-sentence remediation
    console.log(error.details);     // optional structured details
    console.log(error.dapiError);   // raw DAPI public error envelope
  }
}
```

### Three error catalogs

```ts
import {
  CUSTOM_ERROR_CODES, // ~170 SDK-side codes (validation, config)
  DALP_CONTRACT_ERROR_CODES, // every Solidity revert reason
  DAPI_ERROR_IDS, // every public DAPI error id (DALP-XXXXX)
} from "@settlemint/dalp-sdk";

// Branch on stable ids, not free-text messages:
if (error instanceof DalpSdkError && error.id === DAPI_ERROR_IDS.COMPLIANCE_NOT_ELIGIBLE) {
  // Render the "your transfer was blocked by compliance" UI.
}
```

### Decoder helpers

When you have a raw response body (e.g., from a webhook receiver or a non-SDK fetch), reconstruct a typed error:

```ts
import {
  decodeDapiErrorResponseBody,
  getDapiPublicErrorFromResponseBody,
  isDapiPublicError,
  createDalpSdkErrorFromDapiPublicError,
} from "@settlemint/dalp-sdk";

const error = decodeDapiErrorResponseBody(rawBody);
// → DalpSdkError | null
```

### Status code → category cheat sheet

| Status | Typical cause                                           | What the UI should do                                               |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------- |
| 400    | SDK-side validation (`createDalpSdkConfigurationError`) | Inline form validation; never retry                                 |
| 401    | Missing / invalid `apiKey` or session                   | Send the user to sign-in; never retry the call as-is                |
| 403    | Authorization (role / org membership)                   | Show "no permission"; don't auto-retry                              |
| 404    | Resource not found OR indexer lag after a fresh write   | If just after a mutation, poll briefly; otherwise show "not found"  |
| 409    | Idempotency conflict OR compliance reject               | Show `error.message` + `error.fix`; don't retry blindly             |
| 422    | Schema validation by the server                         | Show `error.fix`; usually a bug in the caller                       |
| 429    | Rate limit                                              | Retry with backoff (`error.retryable === true`)                     |
| 5xx    | Platform error                                          | Retry with backoff if `error.retryable === true`, otherwise surface |

### Toast pattern

In the reference apps, errors flow through a `dalpToast(err)` helper that maps `DalpSdkError` fields to a [sonner](https://sonner.emilkowal.ski) toast:

```ts
import { toast } from "sonner";
import { DalpSdkError } from "@settlemint/dalp-sdk";

export function dalpToast(error: unknown): void {
  if (error instanceof DalpSdkError) {
    toast.error(error.message, {
      description: [error.why, error.fix].filter(Boolean).join(" — "),
    });
    return;
  }
  toast.error(error instanceof Error ? error.message : String(error));
}
```

---

## Cross-cutting: Webhook verification

DALP signs every outbound webhook with a per-endpoint secret (format: `dalp_whsk_…`). On your receiver:

```ts
import { verifyWebhook, toStandardWebhookSecret } from "@settlemint/dalp-sdk";

export async function handleWebhook(req: Request) {
  const rawBody = await req.text(); // ⚠️ must be raw, not JSON-parsed

  const result = verifyWebhook({
    rawBody,
    headers: req.headers,
    secret: process.env.DALP_WEBHOOK_SECRET!, // accepts string or string[] for rotation
  });

  if (!result.ok) {
    return new Response(`Invalid signature: ${result.code}`, { status: 400 });
  }

  const event = result.event; // typed Webhook.Event union
  switch (event.type) {
    case "token.created":
      // …
      break;
    // …
  }

  return new Response("ok");
}
```

### Why `toStandardWebhookSecret`

DALP prefixes signing secrets with `dalp_whsk_` for parity with API keys (`sm_dalp_`). The Standard Webhooks library expects the bare secret. `verifyWebhook` strips the prefix internally. If you build your own verifier with `new Webhook(...)`, call `toStandardWebhookSecret(secret)` first.

### Failure codes

| Code                 | Means                                                     | What to do                                                                                                  |
| -------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `TIMESTAMP_SKEW`     | Event timestamp is older than 5 minutes or in the future  | Check NTP drift on receiver; reject the request                                                             |
| `SECRET_MISMATCH`    | Signature didn't match any provided secret                | Likely wrong secret or rotation lag — accept temporary mismatches during rotation with `secret: [old, new]` |
| `BODY_HASH_MISMATCH` | Body was modified in transit (or `evt_id` ≠ `webhook-id`) | Reject; possible MITM or proxy mangling the body                                                            |

### Manifest version

```ts
import { WEBHOOK_MANIFEST_VERSION } from "@settlemint/dalp-sdk";
// e.g. "2026-05-01" — pin your handler to a known event schema version.
```

### Replay protection

DALP includes a unique `webhook-id` header. Persist these in a small Redis / KV with TTL=24h and reject if seen.

---

## Cross-cutting: Serializers

The SDK encodes three non-JSON-native types on the wire. **Use these directly** — don't roll your own.

| Serializer             | Encodes                          | Wire format                                      | Notes                                                       |
| ---------------------- | -------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| `bigDecimalSerializer` | `dnum` tuples `[bigint, number]` | Locale-independent decimal string (`"1.000000"`) | Precision encoded by trailing zeros; round-trip is lossless |
| `bigIntSerializer`     | Native `bigint`                  | Decimal string                                   | JSON has no bigint primitive                                |
| `timestampSerializer`  | `Date`                           | ISO-8601 string                                  | `toISOString()` ↔ `new Date(s)`                             |

```ts
import {
  bigDecimalSerializer,
  bigIntSerializer,
  timestampSerializer,
  dalpSerializers,
} from "@settlemint/dalp-sdk";

// All three, bundled for the RPCLink customJsonSerializers option:
import type { Dnum } from "dnum";
const amount: Dnum = [1_000_000n, 6]; // "1.000000" on the wire
const supply: bigint = 21_000_000n; // "21000000"
const issuedAt = new Date(); // "2026-05-26T…"
```

### Why `dnum` for decimals

ERC-20-style tokens have `decimals` baked into the contract, but DALP carries amounts as `(value, decimals)` tuples so the same field works for tokens with different decimal precision (USDC=6, ETH=18, RWA=2). Always do arithmetic with `dnum` operators — never convert to `number` (float imprecision) or to `string` (no math).

```ts
import { add, multiply, format } from "dnum";

const balance: Dnum = [1_500_000n, 6]; // 1.500000
const fee: Dnum = [50_000n, 6]; // 0.050000
const net = add(balance, fee); // [1_550_000n, 6] = 1.550000
const display = format(net, { digits: 2 }); // "1.55"
```

---

## Domain references

Heavier per-domain detail lives in `references/`. Each file follows the same shape: Overview → Methods → Recipe → Common errors → When you'd build a screen for this.

- [`references/token.md`](references/token.md) — `token.*` and all sub-namespaces (compliance, holders, documents, stats, events)
- [`references/user-kyc.md`](references/user-kyc.md) — the full KYC handshake (`user.kyc.*` + `system.identity.*`)
- [`references/account-reads.md`](references/account-reads.md) — `account`, `transaction`, `search`, `contacts`
- [`references/system-admin.md`](references/system-admin.md) — `system`, `admin`, `settings`, `system.claimTopics`, `system.trustedIssuers`
- [`references/operational.md`](references/operational.md) — `actions`, `addons`, `exchangeRates`, `externalToken`, `identityRecovery`, `webhooks`
- [`references/v2-advanced.md`](references/v2-advanced.md) — `monitoring.api`/`.blockchain`, `compliance`, `organization`, `participants`, `directory`, `smartWallets`, `contracts`, `historicalBalances`

> Open the relevant reference file the moment you need a method's exact input schema or output shape. Don't guess.

---

## What's NOT in the SDK

The SDK wraps the DALP API surface. Some things are platform features the SDK doesn't (or shouldn't) abstract — go to the docs:

| Feature                                           | Why not in SDK                                                                                                                                  | Where to look                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Compliance webhooks (legacy v1 shape)             | Vendor-side webhook format predates the typed registry                                                                                          | `docs.settlemint.com/docs/developer-guides/api-integration/operational-integration-patterns` |
| Raw chain RPC                                     | DALP abstracts the chain; if you need raw `eth_call`, you're below the platform line                                                            | `docs.settlemint.com/docs/architecture/components/infrastructure/key-guardian`               |
| Full S3 file lifecycle                            | SDK wraps presigned URL issuance (`token.documents.create`, `kyc.profileVersionDocument.v2.confirmUpload`); the upload itself goes direct to S3 | `docs.settlemint.com/docs/developer-guides/api-integration/token-documents`                  |
| Restate workflow admin (resume, kill, reschedule) | Read-only access via SDK; admin actions live in the DALP dashboard                                                                              | `docs.settlemint.com/docs/developer-guides/operations/transaction-tracking`                  |
| Smart-contract deployment outside DALP factories  | DALP deploys via on-chain factories; deploying through Hardhat/Foundry directly bypasses the registry                                           | `docs.settlemint.com/docs/architecture/components/contracts`                                 |
| White-label theme + branding                      | App-level concern; the SDK ships no theming layer                                                                                               | This repo's `apps/*` are reference implementations                                           |

If the LLM hits a wall trying to do something with the SDK and one of these is the cause, point the developer at the matching doc URL. Don't fabricate a method.

---

## Conventions used in this file

- **`client.<namespace>.<method>`** — the path on the DAPI client returned by `createDalpClient()`. The platform client exposes the same shape under `platform.dapi.<namespace>.<method>`.
- **`[sync|async]`** in method lines — `async` means the operation enqueues a workflow and you must poll `statusUrl` or subscribe to a webhook.
- **`[idempotency: required|optional|none]`** — `required` means the SDK throws if you call the method without `idempotencyKey`; `optional` means it's accepted; `none` means the method is a pure read.
- **Recipe footer** — every code recipe is mined from the SDK's canonical test fixtures so an LLM can rely on the shape rather than guessing.
- **"When you'd build a screen for this"** — cross-link to which `apps/issuer` or `apps/investor` screen exercises the API. If a method appears here without a cross-link, the reference apps don't use it yet.
