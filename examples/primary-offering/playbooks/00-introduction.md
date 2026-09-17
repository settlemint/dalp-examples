---
title: "Primary offering on DALP — REST API playbooks"
subtitle: "Introduction: base URL, authentication, asynchronous writes, service accounts"
---

# Introduction

These playbooks walk through a primary offering on DALP using **plain HTTP calls**
against the DALP REST API (`/api/v2`). They are the REST translation of the
runnable SDK scripts in `examples/primary-offering/src/`: same calls, same order,
same service accounts, same checks — only the client differs. Use them from
Postman, `curl`, or your own backend.

Every route, parameter and body in these documents was verified against the DALP
**v3.1.21** API contract and the OpenAPI specification a 3.1.21 instance serves.
All nine playbooks were then run end to end with plain `curl` against a DALP 3.1
sandbox, exactly as written here: every call, every body and every poll below
has been seen to work. Your own instance publishes its specification, without
authentication, at:

```
GET https://your-dalp.example.com/api/v2/spec.json
```

Import that file into Postman to get every route as a ready-made request.

## The nine playbooks

| #   | Playbook                  | Service account              | What it does                                                                          |
| --- | ------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Bootstrap check           | reporting                    | Confirms the KYC and AML claim topics exist and have a trusted issuer.                |
| 2   | Issuer onboarding         | operator                     | Creates the issuer user and registers its identity.                                   |
| 3   | Investor onboarding       | operator, then kyc           | Creates each investor, registers the identity, approves KYC, issues KYC + AML claims. |
| 4   | Create the asset          | issuer                       | Deploys the token (paused, zero supply) with roles and compliance modules.            |
| 5   | Go live and set the price | issuer                       | Registers the base price.                                                             |
| 6   | Order-time eligibility    | reporting                    | Registry pre-filter per investor. Transfer simulation needs DALP 3.2.                 |
| 7   | Pre-settlement re-check   | reporting                    | Re-checks every allocation line and reads current holdings.                           |
| 8   | Settlement                | settlement                   | Unpauses, mints the outstanding lines, reads back the transaction record.             |
| 9   | After settlement          | reporting (+ one settlement) | Reads the register now and at the mint block, then pauses the token again.            |

These are happy-path playbooks. They are precise about the call order, which
account makes each call, and which writes you must wait on. They do not cover
retries, failure branches or operator recovery.

## Base URL

All paths in the playbooks are relative to:

```
https://your-dalp.example.com/api/v2
```

The examples use two shell variables:

```bash
export DALP_URL="https://your-dalp.example.com"
export DALP_API="$DALP_URL/api/v2"
```

Request bodies that carry a variable are written as a here-document, so the JSON
stays readable: `-d @-` tells `curl` to read the body from standard input, and
everything between `<<JSON` and `JSON` is that body. In Postman, paste the JSON
as the raw body and replace each `$VARIABLE` with your value.

Every example value — emails, names, symbols, addresses, ids — is a placeholder.

## Authentication and headers

| Header              | When                   | Meaning                                                                                                                                                                                                                                      |
| ------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Api-Key`         | every call             | The API key of the service account making the call. The key's roles decide whether the call is allowed.                                                                                                                                      |
| `Content-Type`      | calls with a JSON body | `application/json`.                                                                                                                                                                                                                          |
| `Idempotency-Key`   | writes only, optional  | A stable string you derive from your own record id. Re-sending the same key does not repeat the side effect. If omitted, the server generates one.                                                                                           |
| `Prefer`            | writes only, optional  | `respond-async` (or no header) answers `202` immediately with a transaction handle. `wait=N` (5–99 seconds) holds the request open until the chain settles. `respond-async, wait=30` waits up to 30 s and then falls back to the 202 handle. |
| `x-organization-id` | optional               | Only needed when the API key has access to more than one organization. A key that belongs to a single organization already carries that context.                                                                                             |
| `X-Executor`        | writes only, optional  | `eoa` or `smart-wallet`. Leave it out and the platform chooses. Send `eoa` when the service account's smart wallet was never deployed (see below).                                                                                           |

There is **no `X-Participant` header** in these flows. The party a call concerns
is always named in the path or the body.

Never put an API key in a URL, a shared Postman collection, or source control.
In Postman, store each key as a secret environment variable.

## Service accounts

The flows use five service accounts, each with its own API key and its own
roles. The split is enforced, and it is enforced **up front**: a call from an
account without the required role answers `403` with `USER_NOT_AUTHORIZED`
(`DALP-0006`) and nothing is queued. This was verified on a sandbox with five
separately provisioned accounts, by sending every write in these playbooks from
each of the wrong accounts.

| Variable in the examples | Account        | Roles                                                         | Used in flows      |
| ------------------------ | -------------- | ------------------------------------------------------------- | ------------------ |
| `$DALP_OPERATOR_KEY`     | svc-operator   | identityManager, complianceManager                            | 2, 3               |
| `$DALP_KYC_KEY`          | svc-kyc        | claimIssuer, and registered as trusted issuer for KYC and AML | 3                  |
| `$DALP_ISSUER_KEY`       | svc-issuer     | tokenManager                                                  | 4, 5               |
| `$DALP_SETTLEMENT_KEY`   | svc-settlement | supplyManagement, emergency (granted on the token in flow 4)  | 4 (one read), 8, 9 |
| `$DALP_REPORTING_KEY`    | svc-reporting  | auditor, read-only                                            | 1, 6, 7, 9         |

What each call needs, as enforced on DALP 3.1:

| Call                                                                              | Role required                                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /users`                                                                     | identityManager                                                                             |
| `GET /users`                                                                      | identityManager, claimIssuer or systemManager                                               |
| identity registration and registration status                                     | identityManager                                                                             |
| KYC profile routes (read, draft, submit, approve)                                 | claimIssuer or identityManager                                                              |
| `POST /system/identity-claims`                                                    | claimIssuer, **and** trusted issuer for the topic                                           |
| `POST /tokens`, `POST /tokens/{tokenAddress}/price`                               | tokenManager                                                                                |
| mint                                                                              | supplyManagement **on the token**                                                           |
| pause, unpause                                                                    | emergency **on the token**                                                                  |
| claim topics, trusted issuers, tokens, holders, events, eligibility, claim events | none beyond `auditor`; claim topics, tokens and holders are open to any organization member |

Two consequences shape the playbooks:

- **The reporting and settlement accounts cannot list users.** Playbooks 6 to 9
  therefore take each investor's wallet from your own onboarding records instead
  of reading it back.
- **`svc-kyc` needs more than the `claimIssuer` role.** Until its identity is
  registered as a trusted issuer for the topic, issuing a claim answers `403`
  with `TRUSTED_ISSUER_PERMISSION_REQUIRED` (`DALP-0043`). Playbook 1 checks
  for this.

### Setting a service account up

A service account is an ordinary platform user with an API key. Each one needs:

1. **Membership** of your organization, and a **wallet**.
2. An **on-chain identity**, for any account that creates a token. Without it
   `POST /tokens` answers `DALP-0318` ("user … does not have an associated
   identity contract"). The account creates its own with `POST /identities`
   (empty body `{}`, queued, poll it).
3. Its **system roles**, granted by an administrator:
   `POST /system/participants/role-grants` with
   `{ "role": "tokenManager", "participantId": "pp_…" }`, one call per role.
   The `participantId` is on the account's row in `GET /users`.
4. For `svc-kyc`, **trusted-issuer registration** by an account holding
   `claimPolicyManager`: `POST /system/trusted-issuers` with
   `{ "issuerAddress": "<svc-kyc identity>", "claimTopicIds": ["…", "…"] }`.
5. An **API key**, created while signed in as that account (Console: Settings →
   API Keys). Give `svc-reporting` a key with the **read** scope: any write from
   a read key answers `403` with `API_KEY_READ_ONLY` (`DALP-0035`), whatever
   roles the account holds.

`svc-settlement` needs no system role at all. Its two token roles are granted by
playbook 4 when the token is created.

## Asynchronous writes: a 202 is a receipt, not an outcome

Every write that touches the chain (identity registration, claim issuance, token
creation, price, pause, unpause, mint) is queued. With `Prefer: respond-async`,
or with no `Prefer` header at all, it answers:

```
HTTP/1.1 202 Accepted

{
  "transactionId": "0198f3a2-7c1e-7b54-9e0a-2f6c1d4e8a90",
  "status": "QUEUED",
  "statusUrl": "/api/v2/transaction-requests/0198f3a2-7c1e-7b54-9e0a-2f6c1d4e8a90"
}
```

The write is **not done** at this point. Poll the transaction until it reaches a
terminal state, and continue only on `COMPLETED`:

```bash
curl -sS "$DALP_API/transaction-requests/$TX_ID" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY"
```

Key response fields (`data`):

| Field                                  | Meaning                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `status`                               | `RECEIVED`, `QUEUED`, `PREPARING`, `PENDING_APPROVAL`, `SIGNING`, `BROADCASTING`, `CONFIRMING`, then a terminal state. |
| `subStatus`                            | Finer-grained state, or `null`.                                                                                        |
| `transactionHash`, `transactionHashes` | The on-chain transaction hash(es) once broadcast.                                                                      |
| `blockNumber`                          | The block the transaction settled in, once confirmed.                                                                  |
| `errorMessage`, `contractError`        | Why it failed. `contractError` carries `why`, `message` and often a `fix`.                                             |
| `result.tokenAddress`                  | Only for a token deployment: the address of the new token.                                                             |

Rules:

- **Terminal states** are `COMPLETED`, `FAILED`, `DEAD_LETTER` and `CANCELLED`.
  Only `COMPLETED` is success.
- `PENDING_APPROVAL` is **not** success. It means an external approval gate
  (custody provider) is holding the transaction.
- Poll at a fixed interval (the SDK uses 2 seconds) with a wall-clock timeout.
  Two minutes is enough for a single chain write; allow **ten minutes** for a
  token deployment, which is a multi-step workflow.
- Use the same API key for polling as for the write.
- A server-sent-events alternative exists at
  `GET /transaction-requests/{transactionId}/stream`.

A minimal polling loop:

```bash
wait_for_tx() {   # usage: wait_for_tx <transactionId> <api-key>
  local deadline=$(( $(date +%s) + 600 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    local body status
    body=$(curl -sS "$DALP_API/transaction-requests/$1" -H "X-Api-Key: $2")
    status=$(echo "$body" | jq -r '.data.status')
    case "$status" in
      COMPLETED) echo "$body" | jq '.data'; return 0 ;;
      FAILED|DEAD_LETTER|CANCELLED)
        echo "$body" | jq '.data | {status, subStatus, errorMessage, contractError}'
        return 1 ;;
    esac
    sleep 2
  done
  echo "timed out waiting for $1"; return 1
}
```

**Handle both answer shapes.** The contract allows a queued write to answer
either with the 202 handle or inline with the finished resource (`{ "data": …,
"meta": { "txHashes": […] } }`), for instance when you send `Prefer: wait=N` and
the chain settles in time. If the response has a `transactionId`, poll it;
otherwise the write is already done.

**Writes that are not queued.** `POST /users`, the KYC profile routes and the
token document routes answer `200` inline with the created resource and have no
transaction to poll.

## Read before you write

Every playbook asks the platform what it already holds and writes only what is
missing: is this user on file, is this identity `ACTIVE`, does this symbol
already have a token, does this holder already hold its allocation. That is what
makes a flow safe to run again after a crash.

The `Idempotency-Key` header is the backstop for the short window between the
read and the write. It is not a substitute for the read: the platform records a
key the moment it accepts a request, so a key spent on a request whose chain
write later failed will keep replaying that first answer. The register is the
source of truth.

How a replayed key behaves, as observed on a 3.1 sandbox:

- Re-sending a key whose write has completed answers **`200` with the finished
  resource** (`{ "data": …, "meta": { "txHashes": […] } }`), not a new `202`
  handle. Nothing is written again. This is the second answer shape described
  above.
- Re-sending a key with a **different body** is **not** rejected. It replays the
  first outcome and writes nothing, so it looks like success while your new
  values were ignored. Derive the key from everything that makes the write
  unique (the playbooks put the price and currency in the price key), and never
  reuse a key for different content.
- Pre-checks run before the replay. A mint replayed against a token that has
  since been paused answers `DALP-0342`, not the stored result.

## Lists, filters and paging

List routes share one query convention, encoded with square brackets:

```
GET /users?filter[email]=alice@example.com
GET /tokens/{tokenAddress}/events?filter[eventName]=MintCompleted&sort=-blockNumber&page[limit]=1
```

- `filter[field]=value` filters on equality. Operators are also available, for
  example `filter[email][iLike]=…`.
- `sort=field` sorts ascending, `sort=-field` descending.
- `page[offset]` defaults to 0 and `page[limit]` to 50.
- Every list answers `{ "data": […], "meta": { "total": n }, "links": {…} }`.

With `curl`, let it do the URL-encoding for you:

```bash
curl -sS -G "$DALP_API/users" \
  --data-urlencode "filter[email]=alice@example.com" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY"
```

Filters match loosely in some cases, so always confirm the row you take from
`data` carries the exact value you searched for.

## Amounts

- A **mint amount** and a **supply cap** are integer strings in the token's
  **base units**. For an 18-decimal token, 1000 units is
  `"1000000000000000000000"` (1000 × 10^18).
- **Balances** in `holders`, `holder-balances` and `GET /tokens` come back in
  **display units** (`"1000.000000000000000000"`). Fields ending in `Exact`
  (`totalSupplyExact`, `balanceExact`) carry the base-unit integer.
- A **price** is sent as a plain decimal string (`"100.00"`).

## Two things specific to the platform

**A counterfactual smart wallet cannot sign.** If a service account's smart
wallet has never been deployed, every queued write ends `DEAD_LETTER` with
"smart wallet is counterfactual but missing participant identity metadata". Send
`X-Executor: eoa` on the writes of that account and its own key signs instead.

**Errors.** A refused call answers with an HTTP error status and this body:

```json
{
  "code": "USER_EMAIL_ALREADY_EXISTS",
  "status": 409,
  "message": "A user with this email already exists.",
  "data": {
    "id": "DALP-0670",
    "category": "client",
    "retryable": false,
    "why": "Each platform user must have a unique email address.",
    "fix": "Use a different email or open the existing user in User management."
  }
}
```

Branch on `code` or `data.id`, not on the HTTP status alone: several business
rule refusals (`DALP-0271`, `DALP-0342`) answer with status `500` although
nothing is wrong with the platform. `data.retryable` says whether sending the
same request again can help, and `data.fix` says what to do instead. A missing
or invalid API key answers `401` with `DALP-0002`. A validation failure answers
`400` with `DALP-0001` and lists the offending fields in `data.issues`. The
playbooks name the codes you are most likely to meet at each step.
