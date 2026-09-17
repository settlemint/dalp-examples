---
title: "Playbook 1 — Bootstrap check"
subtitle: "Read-only · service account: reporting"
---

# Playbook 1 — Bootstrap check

- **SDK source:** `src/01-bootstrap-check.ts`
- **Service account:** `svc-reporting` (`$DALP_REPORTING_KEY`), read-only.
- **Writes:** none.

The platform is set up once in the Console, not by an integration. This playbook
only proves the two things every later flow depends on:

1. the **KYC** and **AML** claim topics exist on the platform, and
2. a **trusted issuer** is registered for both.

Without that registration, claims are still recorded but count for nothing, and
every mint in playbook 8 reverts.

| Step | Call                          | SDK procedure                |
| ---- | ----------------------------- | ---------------------------- |
| 1    | `GET /system/claim-topics`    | `system.claimTopics.list`    |
| 2    | `GET /system/trusted-issuers` | `system.trustedIssuers.list` |

## Step 1 — List the claim topics

**Purpose.** Find the numeric `topicId` of `knowYourCustomer` and
`antiMoneyLaundering`. Later playbooks need these ids.

**Called by.** reporting.

```bash
curl -sS "$DALP_API/system/claim-topics" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

**Key response fields** (`data[]`):

| Field     | Meaning                                                                                    |
| --------- | ------------------------------------------------------------------------------------------ |
| `name`    | The topic name. Registries name a topic either `knowYourCustomer` or `Know Your Customer`. |
| `topicId` | The numeric topic id, as a string. **Keep it** for playbooks 3 and 4.                      |

**Check before moving on.** Compare names after lower-casing and removing every
non-alphanumeric character, so `Know Your Customer` matches `knowYourCustomer`.
Both `knowyourcustomer` and `antimoneylaundering` must be present. The default
page size is 50; if `meta.total` is larger, page with `page[offset]`.

## Step 2 — List the trusted issuers

**Purpose.** Confirm at least one trusted issuer covers each of the two topics.

**Called by.** reporting.

```bash
curl -sS "$DALP_API/system/trusted-issuers" \
  -H "X-Api-Key: $DALP_REPORTING_KEY"
```

**Key response fields** (`data[]`):

| Field                   | Meaning                                   |
| ----------------------- | ----------------------------------------- |
| `id`                    | The trusted issuer's identity address.    |
| `claimTopics[].topicId` | The topic ids this issuer is trusted for. |
| `claimTopics[].name`    | The matching topic names.                 |

**Check before moving on.** For each `topicId` from step 1, at least one issuer
must list it in `claimTopics`. The issuer should be the identity of your
`svc-kyc` service account, because that account signs the claims in playbook 3.

## Outcome

- Both topics present and both covered by a trusted issuer: the platform is
  ready. Continue with playbook 2.
- Anything missing: **stop**. Register the missing topic or trusted issuer in the
  Console, then run this check again.
