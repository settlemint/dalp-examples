---
title: "Playbook 6 — Order-time eligibility"
subtitle: "Read-only · service account: reporting"
---

# Playbook 6 — Order-time eligibility

- **SDK source:** `src/06-order-eligibility.ts`
- **Service account:** `svc-reporting` (`$DALP_REPORTING_KEY`), read-only.
- **Writes:** none.

Two reads answer two different questions, and they are not interchangeable.

- **`recipient-eligibility`** is the cheap pre-filter. It answers only whether
  the address is present in this token's identity registry, active and not lost.
  It is **not** a transfer verdict. Use it to grey out a picker, never as the
  sole reason to accept an order.
- **`transfer-simulate`** is the authoritative check. It dry-runs the exact
  delivery settlement will make and answers _will-clear_ or _will-revert_, with
  the blockers and who can clear each one. **It requires DALP 3.2** and does not
  exist on a 3.1 platform.

On DALP 3.1, accept an order on the pre-filter and let playbook 8 be the place
where compliance is enforced: a mint to a recipient without the required claims
reverts.

| Step | Call                                                                    | SDK procedure                | Availability |
| ---- | ----------------------------------------------------------------------- | ---------------------------- | ------------ |
| 1    | `GET /tokens?filter[symbol]=…`                                          | `token.list`                 | 3.1          |
| 2    | the wallet, from your own records (`GET /users` needs the operator key) | `user.list`                  | 3.1          |
| 3    | `GET /tokens/{tokenAddress}/recipient-eligibility`                      | `token.recipientEligibility` | 3.1          |
| 4    | `GET /tokens/{tokenAddress}/transfer-simulate`                          | `token.transferSimulate`     | **3.2 only** |

## Step 1 — Read the token

**Called by.** reporting.

```bash
curl -sS -G "$DALP_API/tokens" \
  --data-urlencode "filter[symbol]=POCA" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

Keep `data[].id` as `$TOKEN` and `data[].decimals`.

## Step 2 — Take the investor's wallet from your records

**Called by.** nobody, unless the address is lost. Repeat per investor.

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

Keep `data[].signingAddress` as `$WALLET`. If no row carries the email, the
investor has not been onboarded: run playbook 3 first.

## Step 3 — Registry pre-filter

**Called by.** reporting. Repeat per investor.

```bash
curl -sS -G "$DALP_API/tokens/$TOKEN/recipient-eligibility" \
  --data-urlencode "address=$WALLET" \
  --data-urlencode "action=mint" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

| Query parameter | Meaning                                                                   |
| --------------- | ------------------------------------------------------------------------- |
| `address`       | The investor's wallet. Required.                                          |
| `action`        | `mint`, `transfer` or `burn`. Required. A primary allocation is a `mint`. |

**Key response fields** (`data`): `eligible` (boolean), `address`, `action`.

**Check before moving on.** `eligible: true` means the wallet is in the token's
identity registry. `false` means the order cannot settle: send the investor back
through playbook 3. An address the platform has never seen answers `200` with
`eligible: false`, not an error.

## Step 4 — Transfer simulation (DALP 3.2 only)

> **Requires DALP 3.2.** A 3.1 platform has no such route: it is absent from
> the 3.1.21 contract and specification, and a 3.1 sandbox answers `404`. The
> shape below is taken from the 3.2 development line of the API contract.
> Confirm it against your instance's `/api/v2/spec.json` after you upgrade.

On a 3.2 platform, this is the read that decides whether the order is accepted.
A settlement mint has no sender, so it is simulated from the zero address:

```bash
curl -sS -G "$DALP_API/tokens/$TOKEN/transfer-simulate" \
  --data-urlencode "from=0x0000000000000000000000000000000000000000" \
  --data-urlencode "to=$WALLET" \
  --data-urlencode "amount=1000000000000000000000" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

| Query parameter | Meaning                                                               |
| --------------- | --------------------------------------------------------------------- |
| `from`          | Sender wallet. The zero address for a mint.                           |
| `to`            | Recipient wallet.                                                     |
| `amount`        | Integer string in **base units** (1000 units × 10^18 in the example). |

**Key response fields** (`data`): `verdict` (`will-clear` or `will-revert`) and
`blockers[]` (empty on `will-clear`), each with a `code`, the `party` concerned
(`sender` or `recipient`), a `reason`, a `remediationClass` (`self-serve`,
`operator` or `structural`) and a `remediation` describing what clears it, for
example `{ "kind": "issue-claim", "topics": ["knowYourCustomer"] }`.

**Check before moving on.** Accept the order only on `will-clear`.

## Outcome

Every candidate investor has a registry verdict (3.1) or a transfer verdict
(3.2). Continue with playbook 7.
