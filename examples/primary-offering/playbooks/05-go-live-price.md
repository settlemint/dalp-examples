---
title: "Playbook 5 — Go live and set the price"
subtitle: "Service account: issuer"
---

# Playbook 5 — Go live and set the price

- **SDK source:** `src/05-go-live-price.ts`
- **Service account:** `svc-issuer` (`$DALP_ISSUER_KEY`).

Going live at a published moment is your scheduler's job, not the platform's:
your cron fires at the offering's open and makes this one write. The price it
stores is the price every order is quoted against.

| Step | Call                                        | SDK procedure        |
| ---- | ------------------------------------------- | -------------------- |
| 1    | `GET /tokens?filter[symbol]=…`              | `token.list`         |
| 2    | `POST /tokens/{tokenAddress}/price`         | `token.setPrice`     |
| 3    | `GET /transaction-requests/{transactionId}` | `transaction.status` |
| 4    | `GET /tokens/{tokenAddress}/price`          | `token.price`        |

## Step 1 — Read the token and its registered price

**Purpose.** Find the token address, and learn whether the price is already
registered so a cron that fires twice does not write twice.

**Called by.** issuer.

```bash
curl -sS -G "$DALP_API/tokens" \
  --data-urlencode "filter[symbol]=POCA" \
  -H "X-Api-Key: $DALP_ISSUER_KEY"
```

**Key response fields** (`data[]`): `id` (keep as `$TOKEN`), `basePrice`,
`basePriceCurrencyCode`.

**Check before moving on.** If `basePriceCurrencyCode` equals your currency and
`basePrice` equals your price (compare numerically: `"100"` and
`"100.000000000000000000"` are the same price), the price is already registered.
**Stop here**; do not run steps 2–4.

Use this list read for the check, **not** `GET /tokens/{tokenAddress}/price`.
That route reads the price feed and refuses an observation older than the
platform's staleness policy with `DALP-0335`, so an offering that has been open
for days would fail a read that is only meant to confirm nothing needs writing.

## Step 2 — Set the price

**Called by.** issuer.

```bash
curl -sS -X POST "$DALP_API/tokens/$TOKEN/price" \
  -H "X-Api-Key: $DALP_ISSUER_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -H "Idempotency-Key: pof-price-$TOKEN-100.00-AED" \
  -d '{
    "price": "100.00",
    "currencyCode": "AED"
  }'
```

| Body field     | Meaning                                                          |
| -------------- | ---------------------------------------------------------------- |
| `price`        | A positive decimal **string** in display units. Zero is refused. |
| `currencyCode` | ISO 4217, three upper-case letters.                              |

The route creates the token's base-price feed if it has none, and updates it
otherwise.

**Response.** `202` with `{ transactionId, status, statusUrl }`.

## Step 3 — Wait for the price write

```bash
curl -sS "$DALP_API/transaction-requests/$TX_ID" \
  -H "X-Api-Key: $DALP_ISSUER_KEY"
```

**Check before moving on.** `data.status` is `COMPLETED`.

## Step 4 — Read the stored price back

**Called by.** issuer.

```bash
curl -sS -G "$DALP_API/tokens/$TOKEN/price" \
  --data-urlencode "currency=AED" \
  -H "X-Api-Key: $DALP_ISSUER_KEY"
```

`currency` defaults to `USD` when omitted.

**Key response fields** (`data`):

| Field               | Meaning                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `price`, `decimals` | The price as an **integer string** scaled by `decimals` (18, whatever the token's own decimals are). `"100000000000000000000"` with `decimals: 18` is 100. |
| `currency`          | The currency of `price`.                                                                                                                                   |
| `source`            | `feed` or `claim`.                                                                                                                                         |
| `updatedAt`         | When the observation was written.                                                                                                                          |

**Check before moving on.** `price / 10^decimals` equals the price you set, in
the currency you set. From now on `GET /tokens` reports it as `basePrice: "100"`
with `basePriceCurrencyCode: "AED"`, which is what step 1 reads on the next run.

## Outcome

The offering is priced and open. Continue with playbook 6.
