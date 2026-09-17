---
title: "Playbook 7 — Pre-settlement re-check"
subtitle: "Read-only · service account: reporting"
---

# Playbook 7 — Pre-settlement re-check

- **SDK source:** `src/07-allocation-recheck.ts`
- **Service account:** `svc-reporting` (`$DALP_REPORTING_KEY`), read-only.
- **Writes:** none.

Who gets how much is **your** decision, taken in your own allocation engine and
approved by your own officer. DALP is never asked to make it. DALP is asked one
question, once per approved line, immediately before settlement: _would this
exact delivery clear?_ Eligibility can lapse between the order and the mint, and
a line that fails here is cheaper than a reverted settlement.

On DALP 3.2 that question is `transfer-simulate`. On DALP 3.1 this playbook
re-reads the registry pre-filter instead, and reports what each line already
holds, so a re-run shows how much of the round is left to settle.

| Step | Call                                                                    | SDK procedure                | Availability |
| ---- | ----------------------------------------------------------------------- | ---------------------------- | ------------ |
| 1    | `GET /tokens?filter[symbol]=…`                                          | `token.list`                 | 3.1          |
| 2    | `GET /tokens/{tokenAddress}/holders`                                    | `token.holders`              | 3.1          |
| 3    | the wallet, from your own records (`GET /users` needs the operator key) | `user.list`                  | 3.1          |
| 4    | `GET /tokens/{tokenAddress}/recipient-eligibility`                      | `token.recipientEligibility` | 3.1          |
| 5    | `GET /tokens/{tokenAddress}/transfer-simulate`                          | `token.transferSimulate`     | **3.2 only** |

## Step 1 — Read the token

**Called by.** reporting.

```bash
curl -sS -G "$DALP_API/tokens" \
  --data-urlencode "filter[symbol]=POCA" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

Keep `data[].id` as `$TOKEN` and `data[].decimals`.

## Step 2 — Read the holder register

**Purpose.** Learn what every address already holds, in one call.

**Called by.** reporting.

```bash
curl -sS "$DALP_API/tokens/$TOKEN/holders" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

**Key response fields** (`data[]`):

| Field                 | Meaning                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `account.id`          | The holder's wallet address. Compare addresses **case-insensitively**. |
| `value`               | The balance in **display units** (`"1000.000000000000000000"`).        |
| `frozen`, `available` | The frozen and the freely available part of the balance.               |

The default page size is 50. If `meta.total` is larger, page with
`page[offset]` and `page[limit]`, or filter on one holder with
`filter[accountAddress]=…`.

## Step 3 — Take each investor's wallet from your records

**Called by.** nobody, unless the address is lost. Repeat per approved allocation line.

The wallet comes from **your own onboarding records** (playbook 3 returns it
as `wallet` when the user is created). Do not look it up here: `GET /users`
requires `identityManager`, `claimIssuer` or `systemManager`, so the reporting
account is refused with `403` `DALP-0006`. If you have lost the address, read it
back with the **operator** key:

```bash
curl -sS -G "$DALP_API/users" \
  --data-urlencode "filter[email]=alice@investor.example" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY"
```

Keep `data[].signingAddress` as `$WALLET`.

## Step 4 — Re-check the registry pre-filter

**Called by.** reporting. Repeat per approved allocation line.

```bash
curl -sS -G "$DALP_API/tokens/$TOKEN/recipient-eligibility" \
  --data-urlencode "address=$WALLET" \
  --data-urlencode "action=mint" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

**Key response fields** (`data`): `eligible`.

**Check before moving on.** For each line, record three things: the allocated
units (yours), `eligible` (this step), and the current balance (step 2, `0` when
the wallet is not in the register). Drop or hold any line that is not eligible.

## Step 5 — Re-simulate the delivery (DALP 3.2 only)

> **Requires DALP 3.2.** See playbook 6, step 4, for the route's availability
> and the caveat on its shape.

On a 3.2 platform this replaces step 4, per approved line:

```bash
curl -sS -G "$DALP_API/tokens/$TOKEN/transfer-simulate" \
  --data-urlencode "from=0x0000000000000000000000000000000000000000" \
  --data-urlencode "to=$WALLET" \
  --data-urlencode "amount=1000000000000000000000" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

**Check before moving on.** Submit the line to settlement only on
`data.verdict == "will-clear"`.

## Outcome

You hold the list of allocation lines that may be settled, and what each already
holds. Continue with playbook 8.
