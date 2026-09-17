---
title: "Playbook 3 — Investor onboarding"
subtitle: "Service accounts: operator, then kyc"
---

# Playbook 3 — Investor onboarding

- **SDK source:** `src/03-investor-onboarding.ts`
- **Service accounts:** `svc-operator` (`$DALP_OPERATOR_KEY`) for the user and the
  registry, then `svc-kyc` (`$DALP_KYC_KEY`) for the KYC profile and the claims.
- **Repeat** the whole playbook for every investor in the offering.

This is playbook 2 again, plus the two parts that make an investor eligible:

- **The KYC profile.** The platform keeps a reviewed record per user. A
  `knowYourCustomer` claim is refused until that record is approved. Draft,
  submit, approve — the same three states a reviewer works through in the
  Console.
- **The claims.** The KYC service account signs the compliance verdict onto the
  investor's identity. From then on the investor can receive an allocation. The
  case file stays on your side; only the verdict reaches the chain.

| Step | Call                                                    | Account  | SDK procedure                        |
| ---- | ------------------------------------------------------- | -------- | ------------------------------------ |
| 0    | `GET /system/claim-topics`                              | operator | `system.claimTopics.list`            |
| 1    | `GET /users?filter[email]=…`                            | operator | `user.list`                          |
| 2    | `POST /users`                                           | operator | `user.create`                        |
| 3    | `GET /system/identity-registration-statuses`            | operator | `system.identity.registrationStatus` |
| 4    | `POST /system/identity-registrations` + poll            | operator | `system.identity.register`           |
| 5    | `GET /kyc-profiles/{userId}/versions`                   | kyc      | `user.kyc.versions.list`             |
| 6    | `POST /kyc-profiles/{userId}/versions`                  | kyc      | `user.kyc.versions.create`           |
| 7    | `POST /kyc-profile-versions/{versionId}/submissions`    | kyc      | `user.kyc.version.submit`            |
| 8    | `POST /kyc-profile-versions/{versionId}/approvals`      | kyc      | `user.kyc.version.approve`           |
| 9    | `GET /kyc-profiles/{userId}`                            | kyc      | `user.kyc.profile.read`              |
| 10   | `GET /system/identities/{identityAddress}/claim-events` | kyc      | `system.identity.claim.history`      |
| 11   | `POST /system/identity-claims` + poll (once per topic)  | kyc      | `system.identity.claim.issue`        |

## Step 0 — Resolve the topic ids (once, not per investor)

**Purpose.** Step 10 reports claims by numeric topic id, so you need the ids of
`knowYourCustomer` and `antiMoneyLaundering`.

```bash
curl -sS "$DALP_API/system/claim-topics" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY"
```

Keep `data[].topicId` for the two topics, matching names as in playbook 1.

## Steps 1–4 — User, wallet, registered identity

Identical to playbook 2, steps 1–5, with the investor's email and name:

```bash
# 1. Already on file?
curl -sS -G "$DALP_API/users" \
  --data-urlencode "filter[email]=alice@investor.example" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY"

# 2. If not, create. Answers inline; keep data.id and data.wallet.
curl -sS -X POST "$DALP_API/users" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: pof-user-alice@investor.example" \
  -d '{ "email": "alice@investor.example", "name": "Alice Investor" }'

# 3. Registration status; keep data.identityAddress.
curl -sS -G "$DALP_API/system/identity-registration-statuses" \
  --data-urlencode "wallet=$WALLET" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY"

# 4. If status is not ACTIVE, register, then poll the transaction to COMPLETED.
curl -sS -X POST "$DALP_API/system/identity-registrations" \
  -H "X-Api-Key: $DALP_OPERATOR_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -H "Idempotency-Key: pof-register-alice@investor.example" \
  -d @- <<JSON
{ "wallet": "$WALLET", "country": "AE" }
JSON
```

**Check before moving on.** You hold three values for this investor:
`$USER_ID` (`id`), `$WALLET` (`signingAddress` from the list, or `wallet` from
the create) and `$IDENTITY` (`identityAddress`). The identity **must be
`ACTIVE`** before step 11: a claim will not attach to an identity the registry
does not carry.

## Step 5 — Is there an approved KYC version already?

**Called by.** kyc.

```bash
curl -sS "$DALP_API/kyc-profiles/$USER_ID/versions" \
  -H "X-Api-Key: $DALP_KYC_KEY"
```

**Key response fields** (`data[]`): `id`, `versionNumber`, `status`
(`draft`, `submitted`, `under_review`, `approved`, `rejected`).

**Check before moving on.** If any version has `status: "approved"`, skip steps
6–8 and go to step 9.

## Step 6 — Draft a KYC profile version

**Called by.** kyc.

```bash
curl -sS -X POST "$DALP_API/kyc-profiles/$USER_ID/versions" \
  -H "X-Api-Key: $DALP_KYC_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "overwriteDraft": true,
    "initialData": {
      "firstName": "Alice",
      "lastName": "Investor",
      "dob": "1988-04-12T00:00:00.000Z",
      "country": "AE",
      "residencyStatus": "resident",
      "nationalId": "784-1988-1234567-1"
    }
  }'
```

| Body field                    | Meaning                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `overwriteDraft`              | `true` replaces an existing draft instead of failing on it.                                            |
| `initialData.dob`             | ISO 8601 date-time.                                                                                    |
| `initialData.country`         | ISO 3166-1 alpha-2.                                                                                    |
| `initialData.residencyStatus` | `resident`, `non_resident`, `dual_resident` or `unknown`.                                              |
| `initialData.nationalId`      | Max 50 characters. An approved version is **unique on national id + country** within the organization. |

**Key response fields** (`data`): `id` — keep it as `$VERSION_ID`;
`versionNumber`; `status` is `draft`. Answers inline.

## Step 7 — Submit the version for review

**Called by.** kyc. No request body.

```bash
curl -sS -X POST "$DALP_API/kyc-profile-versions/$VERSION_ID/submissions" \
  -H "X-Api-Key: $DALP_KYC_KEY"
```

**Key response fields** (`data`): `status` is `under_review`.

**Note.** The route's description in the specification says at least one
document must be uploaded first. A DALP 3.1 platform does not enforce that: a
version with no documents is accepted and moves to `under_review`. To attach KYC
evidence anyway, use `POST /kyc-profile-versions/{versionId}/documents` before
submitting.

## Step 8 — Approve the version

**Called by.** kyc. The body is required but may be empty.

```bash
curl -sS -X POST "$DALP_API/kyc-profile-versions/$VERSION_ID/approvals" \
  -H "X-Api-Key: $DALP_KYC_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "reviewNotes": "Approved by compliance, case 2026-0142" }'
```

**Key response fields** (`data`): `status` is `approved`, `reviewOutcome` is
`approved`, plus `reviewedAt` and `reviewedBy`.

## Step 9 — Read the content hash of the approved version

**Purpose.** The KYC claim value is not free text. It must be the `contentHash`
of the approved version, which binds the on-chain claim to the exact record the
reviewer approved.

**Called by.** kyc.

```bash
curl -sS "$DALP_API/kyc-profiles/$USER_ID" \
  -H "X-Api-Key: $DALP_KYC_KEY"
```

**Key response fields** (`data`):

| Field                         | Meaning                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `status`                      | Should be `approved`.                                      |
| `approvedVersion.contentHash` | **Keep it** as `$CONTENT_HASH`. It is the KYC claim value. |

**Check before moving on.** `approvedVersion` must not be `null` and its
`contentHash` must not be `null`.

## Step 10 — Which claims does the identity already carry?

**Called by.** kyc.

```bash
curl -sS "$DALP_API/system/identities/$IDENTITY/claim-events" \
  -H "X-Api-Key: $DALP_KYC_KEY"
```

**Key response fields** (`data[]`): `eventName` (`ClaimAdded`, `ClaimChanged`,
`ClaimRemoved`, `ClaimRevoked`) and `topic` (the numeric topic id).

**Check before moving on.** Collect the `topic` of every `ClaimAdded` event. Skip
step 11 for a topic whose id (from step 0) is already in that set.

## Step 11 — Issue the claim (once per missing topic)

**Called by.** kyc. This account must be a trusted issuer for the topic
(playbook 1), or the claim counts for nothing.

KYC claim — the value is the content hash:

```bash
curl -sS -X POST "$DALP_API/system/identity-claims" \
  -H "X-Api-Key: $DALP_KYC_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -H "Idempotency-Key: pof-claim-knowYourCustomer-alice@investor.example" \
  -d @- <<JSON
{
  "targetIdentityAddress": "$IDENTITY",
  "claim": {
    "topic": "knowYourCustomer",
    "data": { "claim": "$CONTENT_HASH" }
  }
}
JSON
```

AML claim — the value is the literal string `"true"`:

```bash
curl -sS -X POST "$DALP_API/system/identity-claims" \
  -H "X-Api-Key: $DALP_KYC_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -H "Idempotency-Key: pof-claim-antiMoneyLaundering-alice@investor.example" \
  -d @- <<JSON
{
  "targetIdentityAddress": "$IDENTITY",
  "claim": {
    "topic": "antiMoneyLaundering",
    "data": { "claim": "true" }
  }
}
JSON
```

| Body field              | Meaning                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `targetIdentityAddress` | The investor's **identity** address (`$IDENTITY`), not the wallet.                              |
| `claim.topic`           | The topic **name**, not the numeric id.                                                         |
| `claim.data.claim`      | `knowYourCustomer`: the `contentHash`. Every other investor topic: the literal string `"true"`. |

**Response.** `202` with `{ transactionId, status, statusUrl }`.

**Check before moving on.** Poll each transaction with the **kyc** key until
`COMPLETED`:

```bash
curl -sS "$DALP_API/transaction-requests/$TX_ID" \
  -H "X-Api-Key: $DALP_KYC_KEY"
```

If `svc-kyc` holds `claimIssuer` but its identity is not a trusted issuer for
the topic, the call answers `403` with `TRUSTED_ISSUER_PERMISSION_REQUIRED`
(`DALP-0043`). Fix the registration (see the introduction), then send the same
request again.

Two more refusals are specific to the `knowYourCustomer` topic, and both arrive
immediately as an HTTP error, before anything is queued:

- `DALP-0273` (status `422`): the target identity has **no approved KYC
  profile**. Run steps 5–9 first.
- `DALP-0271` (status `500`): the claim value is **not the content hash** of the
  approved version.

## Outcome

Each investor has a user, a wallet, an `ACTIVE` identity, an approved KYC
profile, and KYC and AML claims on the identity. Continue with playbook 4.
