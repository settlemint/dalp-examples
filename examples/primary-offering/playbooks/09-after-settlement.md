---
title: "Playbook 9 — After settlement"
subtitle: "Service account: reporting, plus one write from settlement"
---

# Playbook 9 — After settlement

- **SDK source:** `src/09-after-settlement.ts`
- **Service accounts:** `svc-reporting` (`$DALP_REPORTING_KEY`) for every read;
  `svc-settlement` (`$DALP_SETTLEMENT_KEY`) for the one write.

The register is the platform's, not a spreadsheet's. The reads below answer the
questions asked after an offering closes: what does the platform show this
account, which block did the mint settle in, who holds what now, and what did
each holder hold **at that block**. The last one is what an auditor asks for,
because it is a statement about a block and not about now.

The mint block comes from the token's own event log, so the audit read stands on
its own: it needs nothing carried over from the run that settled.

| Step | Call                                                                 | Account    | SDK procedure                            |
| ---- | -------------------------------------------------------------------- | ---------- | ---------------------------------------- |
| 1    | `GET /tokens?filter[symbol]=…`                                       | reporting  | `token.list`                             |
| 2    | `GET /user-asset-balances`                                           | reporting  | `user.assets`                            |
| 3    | `GET /tokens/{tokenAddress}/events`                                  | reporting  | `token.events`                           |
| 4    | `GET /tokens/{tokenAddress}/holder-balances`                         | reporting  | `token.holder`                           |
| 5    | `GET /tokens/{tokenAddress}/historical-balances/{holderAddress}`     | reporting  | `token.historicalBalanceAtBlockByHolder` |
| 6    | `PATCH /tokens/{tokenAddress}/pause-state` + poll (only if unpaused) | settlement | `token.pause`                            |

## Step 1 — Read the token

**Called by.** reporting.

```bash
curl -sS -G "$DALP_API/tokens" \
  --data-urlencode "filter[symbol]=POCA" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

Keep `data[].id` as `$TOKEN` and `data[].pausable.paused`.

## Step 2 — The calling account's own portfolio

**Purpose.** Shows what the platform reports for the authenticated account
itself. For the reporting account this is normally empty; an investor-facing
integration calls the same route with the investor's credentials.

**Called by.** reporting.

```bash
curl -sS "$DALP_API/user-asset-balances" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

**Key response fields** (`data[]`): `token` (the asset), `value`, `frozen`,
`available`, and `byWallet[]` (the split across the account's wallets).

## Step 3 — Find the mint block in the token's event log

**Called by.** reporting.

```bash
curl -sS -G "$DALP_API/tokens/$TOKEN/events" \
  --data-urlencode "filter[eventName]=MintCompleted" \
  --data-urlencode "sort=-blockNumber" \
  --data-urlencode "page[limit]=1" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

**Key response fields** (`data[0]`):

| Field             | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `blockNumber`     | **Keep it** as `$MINT_BLOCK`. The block of the most recent mint. |
| `blockTimestamp`  | When that block was produced.                                    |
| `transactionHash` | Matches the hash from playbook 8, step 6.                        |
| `values[]`        | The event's arguments as `{ name, value }` pairs.                |

The log carries one `MintCompleted` event **per recipient**, so a two-line mint
reports `meta.total: 2`, both in the same block.

**Check before moving on.** If `data` is empty, the token has never been minted:
run playbook 8 first. The event log is served by the indexer, so allow a few
seconds after the mint completes before this read shows it.

## Step 4 — Each holder's balance now

**Called by.** reporting. Repeat per investor, with the wallets from your own
records. The reporting account cannot list users (`403` `DALP-0006`); see
playbook 6, step 2.

```bash
curl -sS -G "$DALP_API/tokens/$TOKEN/holder-balances" \
  --data-urlencode "holderAddress=$WALLET" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

**Key response fields** (`data.holder`, or `null` when the address holds
nothing): `value`, `frozen`, `available` — all in display units — and
`isFrozen`.

To read the whole register in one call instead, use
`GET /tokens/{tokenAddress}/holders` (playbook 7, step 2).

## Step 5 — Each holder's balance at the mint block

**Called by.** reporting. Repeat per investor.

```bash
curl -sS -G "$DALP_API/tokens/$TOKEN/historical-balances/$WALLET" \
  --data-urlencode "atBlock=$MINT_BLOCK" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

| Parameter              | Meaning                                  |
| ---------------------- | ---------------------------------------- |
| `holderAddress` (path) | The investor's wallet.                   |
| `atBlock` (query)      | The block number, as a string. Required. |

**Key response fields** (`data`):

| Field                                                 | Meaning                                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `balance`                                             | The balance at that block, in display units.                                            |
| `balanceExact`                                        | The same, as a base-unit integer string.                                                |
| `asOfBlockNumber`, `asOfBlockTimestamp`, `asOfTxHash` | The checkpoint the answer comes from: the latest balance change at or before `atBlock`. |
| `requestedBlock`                                      | The block you asked about.                                                              |

**Check before moving on.** `404` with
`TOKEN_HISTORICAL_BALANCE_BLOCK_NOT_INDEXED` means `atBlock` is ahead of the
indexer: wait and retry. This read relies on the token's historical-balances
feature, which comes from the asset template chosen in playbook 4.

## Step 6 — Pause the token again (only if it is unpaused)

**Purpose.** A primary offering rests paused until secondary trading is opened
deliberately. The pause state read in step 1 decides whether this write happens.

**Called by.** **settlement** (holds the `emergency` role on the token).

```bash
curl -sS -X PATCH "$DALP_API/tokens/$TOKEN/pause-state" \
  -H "X-Api-Key: $DALP_SETTLEMENT_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -H "Idempotency-Key: pof-pause-$TOKEN-after-settlement" \
  -d '{}'
```

The body is required and may be the empty object `{}`.

**Response.** `202` with `{ transactionId, status, statusUrl }`.

**Check before moving on.** Poll with the **settlement** key until `COMPLETED`:

```bash
curl -sS "$DALP_API/transaction-requests/$TX_ID" \
  -H "X-Api-Key: $DALP_SETTLEMENT_KEY"
```

## Outcome

The offering is settled, the register is readable now and at the mint block, and
the token rests paused.
