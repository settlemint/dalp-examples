---
title: "Playbook 8 — Settlement"
subtitle: "Service account: settlement"
---

# Playbook 8 — Settlement

- **SDK source:** `src/08-settlement.ts`
- **Service account:** `svc-settlement` (`$DALP_SETTLEMENT_KEY`). It holds
  `supplyManagement` and `emergency` on the token, granted in playbook 4.

This is the only playbook where supply comes into existence. The token is
unpaused, the approved allocation is minted, and the transaction record is read
back for the audit file. **Compliance is enforced by the token itself at this
moment**: a recipient without the KYC and AML claims makes the mint revert.

What makes this safe to run again is the **register**, not a local file. The
holder balances are read first and only the lines that are short are minted, so
a settlement job that died halfway finishes the round instead of doubling it.

| Step | Call                                                                     | SDK procedure        |
| ---- | ------------------------------------------------------------------------ | -------------------- |
| 1    | `GET /tokens?filter[symbol]=…`                                           | `token.list`         |
| 2    | `GET /tokens/{tokenAddress}/holders`                                     | `token.holders`      |
| 3    | the wallets, from your own records (`GET /users` needs the operator key) | `user.list`          |
| 4    | `DELETE /tokens/{tokenAddress}/pause-state` + poll (only if paused)      | `token.unpause`      |
| 5    | `POST /tokens/{tokenAddress}/mints`                                      | `token.mint`         |
| 6    | `GET /transaction-requests/{transactionId}`                              | `transaction.status` |
| 7    | `GET /tokens?filter[symbol]=…`                                           | `token.list`         |

## Step 1 — Read the token

**Called by.** settlement.

```bash
curl -sS -G "$DALP_API/tokens" \
  --data-urlencode "filter[symbol]=POCA" \
  -H "X-Api-Key: $DALP_SETTLEMENT_KEY"
```

Keep `data[].id` as `$TOKEN`, `data[].decimals`, and `data[].pausable.paused`.

## Step 2 — Read the holder register

**Called by.** settlement.

```bash
curl -sS "$DALP_API/tokens/$TOKEN/holders" \
  -H "X-Api-Key: $DALP_SETTLEMENT_KEY"
```

**Key response fields** (`data[]`): `account.id` (compare case-insensitively)
and `value` (display units).

## Step 3 — Work out the outstanding lines

For each approved allocation line, compare the investor's balance (step 2) with
its allocation.

The wallet comes from **your own onboarding records** (playbook 3 returns it
as `wallet` when the user is created). Do not look it up here: `GET /users`
requires `identityManager`, `claimIssuer` or `systemManager`, so the settlement
account is refused with `403` `DALP-0006`. If you have lost the address, read it
back with the **operator** key:

```bash
curl -sS -G "$DALP_API/users" \
  --data-urlencode "filter[email]=alice@investor.example" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY"
```

Keep `data[].signingAddress` as `$WALLET`.

**Check before moving on.** A line whose balance already equals its allocation
is settled: leave it out. If **no** line is outstanding, the round is fully
settled. **Stop here** and write nothing.

## Step 4 — Unpause the token (only if it is paused)

**Purpose.** Minting reverts on a paused token. The pause state read in step 1
decides whether this write happens at all.

**Called by.** settlement.

```bash
curl -sS -X DELETE "$DALP_API/tokens/$TOKEN/pause-state" \
  -H "X-Api-Key: $DALP_SETTLEMENT_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -H "Idempotency-Key: pof-unpause-$TOKEN" \
  -d '{}'
```

Unpause is a **`DELETE` with a JSON body**. The body is required and may be the
empty object `{}`. In Postman, select _Body → raw → JSON_ on the DELETE request.

**Response.** `202` with `{ transactionId, status, statusUrl }`.

**Check before moving on.** Poll the transaction with the settlement key until
`COMPLETED`:

```bash
curl -sS "$DALP_API/transaction-requests/$TX_ID" \
  -H "X-Api-Key: $DALP_SETTLEMENT_KEY"
```

## Step 5 — Mint the outstanding lines

**Called by.** settlement. One call mints every outstanding line.

```bash
curl -sS -X POST "$DALP_API/tokens/$TOKEN/mints" \
  -H "X-Api-Key: $DALP_SETTLEMENT_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -H "Idempotency-Key: pof-mint-$TOKEN-round-1" \
  -d '{
    "recipients": [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222"
    ],
    "amounts": [
      "1000000000000000000000",
      "1000000000000000000000"
    ]
  }'
```

| Body field   | Meaning                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `recipients` | One wallet address, or an array of them.                                                                                                                           |
| `amounts`    | One amount, or an array **in the same order** as `recipients`. Integer strings in **base units**: 1000 units of an 18-decimal token is `"1000000000000000000000"`. |

Derive the idempotency key from your own settlement round id, so a retry of the
same round cannot mint twice.

**Response.** `202` with `{ transactionId, status, statusUrl }`.

## Step 6 — Wait for the mint and keep the transaction record

**Called by.** settlement.

```bash
curl -sS "$DALP_API/transaction-requests/$TX_ID" \
  -H "X-Api-Key: $DALP_SETTLEMENT_KEY"
```

**Key response fields** (`data`), for the audit file:

| Field             | Meaning                          |
| ----------------- | -------------------------------- |
| `transactionId`   | The platform's id for the write. |
| `status`          | Must be `COMPLETED`.             |
| `blockNumber`     | The block the mint settled in.   |
| `transactionHash` | The on-chain transaction hash.   |

**Check before moving on.** On `FAILED`, read `errorMessage` and
`contractError` (`contractError.why` and `contractError.fix` are written for an
operator). The usual causes:

- _Recipient not verified_ — the investor's identity is not `ACTIVE` in the
  registry, or a required claim is missing (playbook 3).
- The mint would exceed the `capped-v2` ceiling (playbook 4).
- A recipient address is wrong. Addresses are checked for shape only (`400`
  `DALP-0001`), not for ownership.

An account that does not hold `supplyManagement` on the token never gets a
transaction at all: step 5 answers `403` `DALP-0006`. The same goes for step 4
without `emergency`.

A **paused token** does not get that far: step 5 itself is refused with
`DALP-0342` (`TOKEN_MINT_PAUSED_UNPAUSE_MINTING`, status `500`) and nothing is
queued. Run step 4 and wait for it to complete first.

The mint is a single transaction: if one line reverts, none of the lines is
minted.

## Step 7 — Confirm the total supply

**Called by.** settlement.

```bash
curl -sS -G "$DALP_API/tokens" \
  --data-urlencode "filter[symbol]=POCA" \
  -H "X-Api-Key: $DALP_SETTLEMENT_KEY"
```

**Check before moving on.** `data[].totalSupply` (display units) equals the sum
of every settled line.

## Outcome

Supply is issued and the investors hold it. Continue with playbook 9.
