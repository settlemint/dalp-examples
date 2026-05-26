# `system`, `admin`, `settings` — platform configuration

System reads + sub-namespaces (claim topics, trusted issuers, addon factory, directory, feeds, stats), org-admin operations, and platform settings (themes, asset-type templates, compliance templates). `system.identity.*` is covered in [`user-kyc.md`](user-kyc.md) — this file covers everything else under `system.*`.

The reference apps rely on a handful of these (system read + claim topics + trusted issuers + settings.assetTypeTemplates). The rest is the surface a platform admin uses to bootstrap and configure DALP itself.

---

## system (`client.system.*`) — core

### Overview

A SMART **system** is one deployed bundle of registry contracts: the identity registry, the compliance engine, the token factory registry, the claim topics registry, the trusted issuers registry. An org has one active system by default; the SDK uses `systemAddress: "default"` to point at it. Multi-system deployments are rare — most apps treat the default as singular.

### Methods

| Method                 | Path                              | Idempotency | Sync/async |
| ---------------------- | --------------------------------- | ----------- | ---------- |
| `client.system.list`   | GET `/api/systems`                | n/a         | sync       |
| `client.system.create` | POST `/api/systems`               | required    | **async**  |
| `client.system.read`   | GET `/api/system/{systemAddress}` | n/a         | sync       |
| `client.system.resume` | POST `/api/system/resume`         | required    | async      |

### Recipe: Read the default system

```ts
const system = await client.system.read({
  params: { systemAddress: "default" },
});

console.log(system.data.identityRegistry); // address
console.log(system.data.complianceEngine);
console.log(system.data.tokenFactoryRegistry);
console.log(system.data.tokenFactories); // deployed factories, one per asset type
```

### Recipe: Deploy a new system (rare — first-run only)

```ts
const created = await client.system.create({
  body: {
    name: "Production",
    walletVerification,
    idempotencyKey,
  },
});
// Async — the workflow deploys all registry contracts.
await pollTransaction(created.data.transactionId);
```

`system.resume` exists for stalled deployments — it picks up a half-deployed system that failed during bootstrap and continues from the last successful step. Idempotent + safe to call repeatedly.

### When you'd build a screen for this

- **Every app loader** calls `system.read({ systemAddress: "default" })` once on boot to seed the registry-address context (used implicitly by token + identity flows). The reference apps don't render this — it's pure plumbing.
- **Platform admin "deploy system" wizard** would use `system.create` + `system.resume` (out of scope for v1 reference apps).

---

## system.claimTopics (`client.system.claimTopics.*`)

### Overview

Claim topics are the ERC-3643 / OnchainID enumeration of _what kinds of claims_ can be attached to an identity (e.g., `KYC_APPROVED`, `ACCREDITED_INVESTOR`, `PEP_CHECK`). The platform admin defines the list; trusted issuers issue claims of those types; compliance modules read them.

### Methods (verify in `kit/sdk/src/contract.ts`)

| Method                             | Purpose                                     |
| ---------------------------------- | ------------------------------------------- |
| `client.system.claimTopics.list`   | List all defined claim topics in the system |
| `client.system.claimTopics.read`   | Read a single topic's metadata + bytes32 id |
| `client.system.claimTopics.create` | Add a new claim topic (admin only)          |
| `client.system.claimTopics.update` | Update topic metadata                       |

### Recipe

```ts
const topics = await client.system.claimTopics.list({});
for (const topic of topics.data) {
  console.log(topic.id, topic.name); // e.g. "KYC_APPROVED", "ACCREDITED_INVESTOR"
}
```

### When you'd build a screen for this

- **Issuer Reserve Token → Compliance Modules step (TKT-6)** reads `claimTopics.list` so the user can pick which topics are required for the token's identity allow/block list.
- **Compliance admin / "what does this claim mean" surface** would use `claimTopics.read`.

---

## system.trustedIssuers (`client.system.trustedIssuers.*`)

### Overview

The registry of _who is allowed to issue what claim topics_. A trusted issuer is an organization (KYC vendor, AML provider, internal compliance team) whose claims are accepted by the compliance engine. Each issuer is scoped to one or more claim topics they can mint.

### Methods (verify in `kit/sdk/src/contract.ts`)

| Method                                | Purpose                                            |
| ------------------------------------- | -------------------------------------------------- |
| `client.system.trustedIssuers.list`   | List all trusted issuers + their authorized topics |
| `client.system.trustedIssuers.read`   | Read a single issuer                               |
| `client.system.trustedIssuers.create` | Authorize a new issuer (admin)                     |
| `client.system.trustedIssuers.update` | Update authorized topics                           |
| `client.system.trustedIssuers.delete` | Revoke issuer authorization                        |

### Recipe

```ts
const issuers = await client.system.trustedIssuers.list({});
for (const issuer of issuers.data) {
  console.log(issuer.address, issuer.name, issuer.allowedTopics);
}
```

### When you'd build a screen for this

- **Compliance admin → "who can issue this topic"** uses `trustedIssuers.list` filtered by topic.
- **Out of scope for v1 reference apps** — the issuer org itself is auto-authorized for KYC during deployment.

---

## system.factory (`client.system.factory.*`) and system.addonFactory

### Overview

The on-chain factories that deploy new token contracts. The token factory registry holds one factory per asset type (Bond, Equity, Fund, Stablecoin, Deposit, RWA). The addon factory deploys feature contracts (fixed yield schedules, maturity redemption schedules) attached to a token after creation.

Most apps don't talk to factories directly — `client.token.create` handles factory selection internally based on the `type` field. These endpoints are for platform admins inspecting / replacing factories.

### When you'd build a screen for this

- **Platform admin → registered factories table** (out of scope for v1 reference apps).

---

## system.feeds (`client.system.feeds.*`)

### Overview

Price-feed configuration — DALP token pricing pulls from on-chain feeds (Chainlink-style or platform-managed). `system.feeds.*` is the registry of available feeds and the platform admin's surface to register / pause / replace them.

### When you'd build a screen for this

- **Platform admin → price feeds** (out of scope for v1 reference apps).

---

## system.activity (`client.system.activity.*`), system.stats, system.entity, system.directory

These are platform-level read surfaces — system-wide activity log, aggregate stats, entity directory, participant directory. None are on the critical path for the v1 reference apps. Their schemas live alongside `system/` in `packages/dalp/api-contract/src/routes/system/`; check `contract.ts` for the exact method list when you need them.

---

## admin (`client.admin.*`)

### Overview

Off-chain admin operations. Currently exposes one thing: a paginated list of every organization in the platform. Admin-only — non-admin callers 403. Most "admin" operations you'd reach for (user admin, role grants) live under `user.admin*` or the Better Auth `auth.admin.*` namespace instead.

### Methods

| Method                            | Path                           | Idempotency | Sync/async |
| --------------------------------- | ------------------------------ | ----------- | ---------- |
| `client.admin.organizations.list` | GET `/api/admin/organizations` | n/a         | sync       |

### Recipe: List all organizations

```ts
const orgs = await client.admin.organizations.list({
  query: { page: { limit: 25, offset: 0 } },
});
for (const org of orgs.data) {
  console.log(org.id, org.name, org.ownerCount, org.memberCount);
}
```

### When you'd build a screen for this

- **Platform admin "all organizations" table** (out of scope for v1 reference apps).

---

## settings (`client.settings.*`)

### Overview

Key/value platform settings + themed branding + asset-type templates + compliance templates. The settings store is a flat string → string map with helper sub-contracts for the structured slots (theme, asset-type templates, compliance templates).

### Methods

| Method                                  | Path                                   | Idempotency | Sync/async |
| --------------------------------------- | -------------------------------------- | ----------- | ---------- |
| `client.settings.read`                  | GET `/api/settings/{key}`              | n/a         | sync       |
| `client.settings.list`                  | GET `/api/settings`                    | n/a         | sync       |
| `client.settings.upsert`                | POST `/api/settings`                   | optional    | sync       |
| `client.settings.delete`                | DELETE `/api/settings/{key}`           | required    | sync       |
| `client.settings.publicConfig.get`      | GET `/api/settings/public-config`      | n/a         | sync       |
| `client.settings.globalTheme.get`       | GET `/api/settings/global-theme`       | n/a         | sync       |
| `client.settings.globalTheme.set`       | POST `/api/settings/global-theme`      | required    | sync       |
| `client.settings.theme.preview`         | POST `/api/settings/theme/preview`     | n/a         | sync       |
| `client.settings.theme.update`          | POST `/api/settings/theme/update`      | required    | sync       |
| `client.settings.theme.uploadLogo`      | POST `/api/settings/theme/upload-logo` | required    | sync       |
| `client.settings.complianceTemplates.*` | (sub-contract — see below)             | varies      | varies     |

### Recipe: Read a single setting

```ts
const value = await client.settings.read({
  params: { key: "default-jurisdiction" },
});
console.log(value.data); // "DE" | null
```

### Recipe: Upsert a setting

```ts
await client.settings.upsert({
  body: {
    key: "default-jurisdiction",
    value: "DE",
  },
});
```

### Recipe: Read public config (unauthenticated allowed)

```ts
const config = await client.settings.publicConfig.get({});
// Returns the public-safe subset of org config — theme, branding, supported
// languages, etc. Safe to call before sign-in.
```

### settings.complianceTemplates

Pre-built compliance-module bundles ("Standard EU retail bond", "US accredited-only fund", etc.) the issuer wizard can drop into a token-create body. The compliance templates sub-contract exposes `list`, `read`, `create`, `update`, `delete` — admin-managed.

```ts
const templates = await client.settings.complianceTemplates.list({});
for (const template of templates.data) {
  console.log(template.id, template.name, template.modules);
}
```

### Asset type templates

> The brainstorm doc references `client.settings.assetTypeTemplates.list` for the issuer wizard's asset-type picker. Verify the exact path in `contract.ts` — it may live under `client.settings.assetTypeTemplates.*` or as a flat `client.settings.read({ key: "asset-type-templates" })` depending on the current API version.

### When you'd build a screen for this

- **Issuer Reserve Token → Asset Type step (TKT-6)** uses `settings.assetTypeTemplates.list` (or equivalent) to render the selectable card grid.
- **Issuer Reserve Token → Compliance Modules step (TKT-6)** uses `settings.complianceTemplates.list` for the "use a template" shortcut.
- **Theming UI (out of scope for v1)** would use `settings.globalTheme.*` and `settings.theme.*`.

---

## Reference apps cross-link summary

| Reference app screen                              | Methods used                                                   |
| ------------------------------------------------- | -------------------------------------------------------------- |
| App boot — registry context                       | `system.read({ systemAddress: "default" })`                    |
| Issuer Reserve Token → Asset Type (TKT-6)         | `settings.assetTypeTemplates.list`                             |
| Issuer Reserve Token → Compliance Modules (TKT-6) | `system.claimTopics.list`, `settings.complianceTemplates.list` |
| Public landing (pre-signin)                       | `settings.publicConfig.get`                                    |
