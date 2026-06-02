# `account`, `transaction`, `search`, `contacts` — investor read surface

The day-to-day read endpoints an investor app leans on: search the platform, read a transaction by hash, look up an account, and manage a personal contacts book. Mutations on user identity and balance live in [`user-kyc.md`](user-kyc.md) and [`token.md`](token.md); this file is the read-heavy investor side.

---

## account (`client.account.*`)

### Overview

The v1 account namespace is intentionally tiny — DALP routes most account-shaped reads through the user namespace (`client.user.assets`, `client.user.me`). What lives here is the _cross-org_ address resolver: given a wallet, what accounts are linked to it across organizations the caller can see.

### Method

| Method                  | Path                      | Idempotency | Sync/async |
| ----------------------- | ------------------------- | ----------- | ---------- |
| `client.account.search` | GET `/api/account/search` | n/a         | sync       |

### Recipe: Search for accounts by wallet

```ts
const result = await client.account.search({
  query: {
    address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  },
});

for (const account of result.data) {
  console.log(account.id, account.organizationId, account.kind);
}
```

> For the investor's own balances + holdings, use `client.user.assets` (paginated rollup across tokens). For per-token balance of a specific holder, use `client.token.holder({ params: { tokenAddress }, query: { holderAddress } })` from [`token.md`](token.md).

### When you'd build a screen for this

- **Issuer "look up a holder" admin action** could use `account.search` to find every account tied to a wallet (KYC review side-panel).
- **Out of scope for v1 reference apps.**

---

## transaction (`client.transaction.*`)

### Overview

Every state-changing operation in DALP funnels through the transaction tracker. `transaction.read` is the canonical "what happened to my mutation?" endpoint — give it a `transactionId` (returned by every async mutation) and it returns the current status, on-chain receipt (if landed), and the chain of related workflow steps.

### Method

| Method                    | Path                                   | Idempotency | Sync/async |
| ------------------------- | -------------------------------------- | ----------- | ---------- |
| `client.transaction.read` | GET `/api/transaction/{transactionId}` | n/a         | sync       |

### Recipe: Wait for an async mutation to finish

```ts
// Most async mutations return a payload like:
// { data: { id: "tx_...", statusUrl: "/api/transaction/tx_..." }, ... }
const created = await client.token.create({ body: { ... } });
const transactionId = created.data.id;

// Poll the transaction until status is terminal:
async function waitForTransaction(id: string, opts = { intervalMs: 1500, timeoutMs: 60_000 }) {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const tx = await client.transaction.read({ params: { transactionId: id } });
    if (tx.data.status === "completed" || tx.data.status === "failed") {
      return tx.data;
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  throw new Error(`Transaction ${id} did not settle within ${opts.timeoutMs}ms`);
}

const settled = await waitForTransaction(transactionId);
console.log(settled.status);          // "completed" | "failed"
console.log(settled.transactionHash); // on-chain hash if completed
console.log(settled.events);          // decoded event chain
```

### Common errors (transaction)

| Code                    | Status | When                                      | What to do                                                                                           |
| ----------------------- | ------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `TRANSACTION_NOT_FOUND` | 404    | Unknown id, OR caller doesn't have access | Confirm the id; in cross-tenant scenarios DALP returns 404 to avoid leakage                          |
| `TRANSACTION_TIMEOUT`   | 504    | Workflow stuck past its SLA               | Surface to the user with a "we're checking on this" message; do not auto-retry the original mutation |

> **Activity-feed listings come from `client.user.events`** (per-user, paginated by user-facing event types like "received token X", "transferred Y"), not from `transaction.read`. `transaction.read` is point-lookup-by-id; if you need a feed, use `user.events`.

### When you'd build a screen for this

- **Investor "deploy in progress" / "transfer in progress" status UI** uses `transaction.read` to drive a poll loop after any async mutation after any async mutation.
- **Issuer Token Console → Activity tab** (`/console/tokens/$id`) is `client.user.events` filtered to this token, not `transaction.read`. `transaction.read` is the drill-in detail after a click.

---

## search (`client.search.global`)

### Overview

One endpoint, three result types — runs a permission-aware search across **contacts, tokens, and users** and returns a unified bucket-shaped response. The investor app uses this to power "find a token / find a contact" omnibox; the issuer app uses it for the address-bar search across all entities.

### Method

| Method                 | Path              | Idempotency | Sync/async |
| ---------------------- | ----------------- | ----------- | ---------- |
| `client.search.global` | GET `/api/search` | n/a         | sync       |

### Recipe: Omnibox search

```ts
const results = await client.search.global({
  query: { q: "ada" },
});

// Three buckets, each capped to a small N:
console.log(results.data.users); // matching users
console.log(results.data.contacts); // matching contacts
console.log(results.data.tokens); // matching tokens

// Each bucket is a list of {id, label, secondary, kind}-shaped rows
// ready to render in a dropdown.
```

The search is **permission-aware** — the caller only sees buckets they have read access to. A regular investor sees their own contacts + public tokens; an issuer admin sees all org users + all tokens.

### When you'd build a screen for this

- **Issuer top-bar global search** uses `search.global` to surface mixed results in a single dropdown.
- **Investor "find a token" omnibox** (optional in v1) would use `search.global` filtered to the `tokens` bucket.

---

## contacts (`client.contacts.*`)

### Overview

Per-user address book. An investor can label wallets they transfer to repeatedly so the transfer form auto-completes by name. An issuer can keep a contacts list of trusted counterparties for XvP / forced-transfer flows. Contacts are scoped to the calling user, not to the organization.

### Methods

The v2 `contacts` namespace exposes exactly four methods — **`{ list, read, upsert, delete }`**. There is **no `contacts.search` on v2** (it was a v1-only route, never wired into the dapi client; calling it fails at runtime). For live keystroke filtering, call `contacts.list` and filter the returned items client-side.

| Method                   | Path                        | Idempotency | Sync/async |
| ------------------------ | --------------------------- | ----------- | ---------- |
| `client.contacts.list`   | GET `/api/contacts`         | n/a         | sync       |
| `client.contacts.read`   | GET `/api/contacts/{id}`    | n/a         | sync       |
| `client.contacts.upsert` | POST `/api/contacts`        | optional    | sync       |
| `client.contacts.delete` | DELETE `/api/contacts/{id}` | required    | sync       |

### Recipe: List + paginate contacts

```ts
const contacts = await client.contacts.list({
  query: {
    page: { limit: 25, offset: 0 },
    sortBy: "name",
    sortDirection: "asc",
  },
});

for (const contact of contacts.data) {
  console.log(contact.id, contact.name, contact.wallet);
}
console.log(contacts.meta.totalCount);
```

### Recipe: Save a new contact (upsert)

```ts
const saved = await client.contacts.upsert({
  body: {
    name: "Counterparty A",
    wallet: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
    note: "Bond trade partner — Q3 settlement",
  },
});
console.log(saved.data.id);
```

Upsert is idempotent on `wallet` — calling twice with the same wallet updates the existing row instead of creating a duplicate.

### Recipe: Delete by id

```ts
await client.contacts.delete({
  params: { id: contactId },
});
```

### Recipe: Transfer-form recipient autocomplete (client-side filter)

v2 has no `contacts.search`. Power the live keystroke autocomplete by listing contacts once and filtering the items in the app by the typed query (name prefix OR wallet prefix):

```ts
const contacts = await client.contacts.list({
  query: { page: { limit: 100, offset: 0 }, sortBy: "name", sortDirection: "asc" },
});

function filterContacts(query: string) {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return contacts.data;
  return contacts.data.filter(
    (c) => c.name.toLowerCase().includes(q) || c.wallet.toLowerCase().includes(q),
  );
}
```

Use the same `contacts.list` read for both the transfer-form autocomplete (filter client-side) and the contacts management page.

### Common errors (contacts)

| Code                        | Status | When                                                                             | What to do                                 |
| --------------------------- | ------ | -------------------------------------------------------------------------------- | ------------------------------------------ |
| `CONTACT_NOT_FOUND`         | 404    | id doesn't exist or belongs to a different user                                  | Treat as deleted; refresh the list         |
| `CONTACT_VALIDATION_FAILED` | 422    | Wallet not a valid 0x hex, name too long                                         | Inspect `error.details`                    |
| `CONTACT_DUPLICATE`         | 409    | Trying to create a second row for the same wallet without using upsert semantics | Use `upsert` (same path), not a raw create |

### When you'd build a screen for this

- **Investor transfer form** uses `contacts.list` + a client-side filter to autocomplete the "to" field (there is no `contacts.search` on v2).
- **Issuer XvP / settlement counterparty picker** (out of scope for v1 apps) would use `contacts.list` (filtering items in the app).
- **Settings → Contacts management page** (out of scope for v1) would use the full CRUD.
