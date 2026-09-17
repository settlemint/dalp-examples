---
title: "Playbook 2 — Issuer onboarding"
subtitle: "Service account: operator"
---

# Playbook 2 — Issuer onboarding

- **SDK source:** `src/02-issuer-onboarding.ts`
- **Service account:** `svc-operator` (`$DALP_OPERATOR_KEY`).
- **Writes:** up to two, each guarded by a read.

The issuer needs a platform user, a wallet and a registered identity before it
can list anything. `POST /users` does most of it in one call: account,
membership, wallet, identity contract, and a pending entry in the identity
registry.

| Step | Call                                                         | SDK procedure                        |
| ---- | ------------------------------------------------------------ | ------------------------------------ |
| 1    | `GET /users?filter[email]=…`                                 | `user.list`                          |
| 2    | `POST /users` (only if step 1 found nobody)                  | `user.create`                        |
| 3    | `GET /system/identity-registration-statuses`                 | `system.identity.registrationStatus` |
| 4    | `POST /system/identity-registrations` (only if not `ACTIVE`) | `system.identity.register`           |
| 5    | `GET /transaction-requests/{transactionId}`                  | `transaction.status`                 |

## Step 1 — Is the issuer already on file?

**Purpose.** `POST /users` is unique on email and answers `409` for an address it
already knows, so look the user up first.

**Called by.** operator.

```bash
curl -sS -G "$DALP_API/users" \
  --data-urlencode "filter[email]=issuer@your-company.example" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY"
```

**Key response fields** (`data[]`):

| Field            | Meaning                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `id`             | The user id.                                                                                              |
| `email`          | Confirm it equals the address you searched for.                                                           |
| `signingAddress` | **The wallet address to use** in every later step.                                                        |
| `wallet`         | The account's smart wallet. It stays `null` while the smart wallet is not deployed, so do not rely on it. |

**Check before moving on.** If a row with the exact email exists, keep its
`signingAddress` as `$WALLET` and skip step 2.

## Step 2 — Create the issuer user

**Purpose.** Create the account, wallet and on-chain identity in one call.

**Called by.** operator.

```bash
curl -sS -X POST "$DALP_API/users" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: pof-user-issuer@your-company.example" \
  -d '{
    "email": "issuer@your-company.example",
    "name": "Primary Offering Issuer"
  }'
```

**Key response fields** (`data`):

| Field      | Meaning                                        |
| ---------- | ---------------------------------------------- |
| `id`       | The new user id.                               |
| `wallet`   | The wallet address. Keep it as `$WALLET`.      |
| `identity` | The address of the deployed identity contract. |

**Check before moving on.** This write answers **inline** with the created user;
there is no transaction to poll. `409` with `USER_EMAIL_ALREADY_EXISTS`
(`DALP-0670`) means the email already exists: go back to step 1. The `wallet`
returned here is the same address the list in step 1 reports as
`signingAddress`.

## Step 3 — Read the identity's registration status

**Purpose.** Learn the identity address and whether the registry already carries
it. Registering a wallet the registry already carries reverts on chain, so this
read decides whether step 4 runs at all.

**Called by.** operator.

```bash
curl -sS -G "$DALP_API/system/identity-registration-statuses" \
  --data-urlencode "wallet=$WALLET" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY"
```

**Key response fields** (`data`):

| Field             | Meaning                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `status`          | `NO_SYSTEM`, `NO_IDENTITY`, `NOT_REGISTERED`, `PENDING` or `ACTIVE`. |
| `identityAddress` | The on-chain identity contract behind the wallet.                    |

**Check before moving on.** Right after `POST /users` the status is `PENDING`,
not `NOT_REGISTERED`: the identity exists, but the registry does not carry it
yet. If the status is `ACTIVE`, the issuer is fully onboarded and you are done.
If `identityAddress` is missing, no identity contract was deployed for this
wallet: stop and investigate.

## Step 4 — Register the identity

**Purpose.** Write the identity and its country into the registry. This moves
the status to `ACTIVE`. Nothing downstream — no claim, no transfer, no mint —
counts until it is `ACTIVE`.

**Called by.** operator.

```bash
curl -sS -X POST "$DALP_API/system/identity-registrations" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -H "Idempotency-Key: pof-register-issuer@your-company.example" \
  -d @- <<JSON
{
  "wallet": "$WALLET",
  "country": "AE"
}
JSON
```

| Body field | Meaning                                               |
| ---------- | ----------------------------------------------------- |
| `wallet`   | The wallet whose identity is registered.              |
| `country`  | ISO 3166-1 **alpha-2** country code (`AE`). Required. |

**Response.** `202` with `{ transactionId, status, statusUrl }`.

## Step 5 — Wait for the registration

**Called by.** operator.

```bash
curl -sS "$DALP_API/transaction-requests/$TX_ID" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY"
```

**Check before moving on.** Poll until `data.status` is `COMPLETED` (see the
introduction). Any other terminal state is a failure. Optionally repeat step 3
and confirm the status is now `ACTIVE`.

## Outcome

The issuer has a user, a wallet and an `ACTIVE` identity. Continue with
playbook 3.
