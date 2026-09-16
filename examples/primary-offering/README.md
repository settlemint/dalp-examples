# Primary offering on DALP

One runnable script per flow of a primary offering: onboard the parties, create
the asset, price it, check who may receive it, settle the allocation, and read
the register afterwards. Each script is a headless Bun program that calls
`@settlemint/dalp-sdk` against a DALP sandbox and prints what it did. Read one
file, copy the call sequence into your own backend.

These are basic examples. Every one is the happy path: no retries, no failure
branches, no operator recovery, no UI. What they are precise about is the call
order, which service account makes each call, and which writes you must wait on.

## Run them

```bash
bun install
cp examples/primary-offering/.env.example examples/primary-offering/.env
# fill in DALP_URL, DALP_ORG_ID and the five service-account keys

cd examples/primary-offering
bun run flow:01
bun run flow:02
bun run flow:03
bun run flow:04
bun run flow:05
bun run flow:06
bun run flow:07
bun run flow:08
bun run flow:09
```

Nothing is carried between the scripts in a file. `src/lib/offering.ts` names the
things that are yours — the symbol you list under, the addresses your onboarding
team holds, the size your allocation engine approved — and every script reads
everything else back from the platform: is this user on file, is this identity in
the registry, does this symbol already have a token, does this holder already
hold its allocation. That is what your own backend has to do after a crash, and
it is what makes each flow safe to run again.

Running all nine a second time therefore writes nothing:

```
  user     1628e8bd-5c6e-4cd1-b84b-0443d800705e (already on file)
  identity 0x921D3bCFDaDA318B656c2E420cED77b2c82FdC8b (ACTIVE)
  kyc profile version 1: already approved
  claim knowYourCustomer: already on the identity
  POFA is already listed at 0x4ea495bae514Fc3DA646771adB05cF10761d64d5, supply 2000
  price 100 AED is already registered
  alice@primary-offering.example: already holds 1000, nothing to settle
```

To work on a second offering, name it in the environment rather than editing the
file:

```bash
POF_SYMBOL=POCB \
POF_ISSUER=issuer-b@primary-offering.example \
POF_INVESTORS=carol@primary-offering.example,dave@primary-offering.example \
  bun run flow:02
```

## The nine flows

| Flow | Script                          | Service account                                            | What it does                                                                                                                                                          |
| ---- | ------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `src/01-bootstrap-check.ts`     | `DALP_REPORTING_KEY`                                       | Confirms the KYC and AML topic schemes exist and a trusted issuer is registered for both. Exits non-zero if not.                                                      |
| 2    | `src/02-issuer-onboarding.ts`   | `DALP_OPERATOR_KEY`                                        | Creates the issuer user, wallet and identity, then registers the identity unless the registry already carries it.                                                     |
| 3    | `src/03-investor-onboarding.ts` | `DALP_OPERATOR_KEY`, then `DALP_KYC_KEY`                   | The same for every investor, plus the KYC profile and the KYC and AML claims, each skipped when the identity already carries it.                                      |
| 4    | `src/04-create-asset.ts`        | `DALP_ISSUER_KEY`                                          | Deploys the token paused with zero supply unless the symbol is listed, grants settlement its roles, installs the identity-verification rule and the offering ceiling. |
| 5    | `src/05-go-live-price.ts`       | `DALP_ISSUER_KEY`                                          | Registers the base-price feed unless one is registered at that price, then reads it back.                                                                             |
| 6    | `src/06-order-eligibility.ts`   | `DALP_REPORTING_KEY`                                       | The registry pre-filter on every candidate. The authoritative transfer simulation needs DALP 3.2 and is carried as a comment.                                         |
| 7    | `src/07-allocation-recheck.ts`  | `DALP_REPORTING_KEY`                                       | Re-checks every approved allocation line immediately before settlement, and reports what it already holds. The 3.2 re-simulation is carried as a comment.             |
| 8    | `src/08-settlement.ts`          | `DALP_SETTLEMENT_KEY`                                      | Reads the register, unpauses if paused, mints only the lines that are short of their allocation, reads the transaction record back.                                   |
| 9    | `src/09-after-settlement.ts`    | `DALP_REPORTING_KEY`, one write from `DALP_SETTLEMENT_KEY` | Finds the mint block in the token's event log, reads the holder register now and at that block, then pauses the token again.                                          |

## What every script does the same way

**The SDK is the only client.** Every call goes through `@settlemint/dalp-sdk`.
There is no `fetch`, no hand-built HTTP client and no REST path anywhere in
`src/`.

**Every response type comes from the SDK.** No request or response shape is
written by hand. The pin is `3.1.20`, the first published release whose `.d.ts`
files are self-contained; up to `3.1.19` they re-exported an unpublished
workspace package, which under `skipLibCheck` silently degraded the client to
`any` and left every call unchecked.

**No local state.** There is no scratch file and no id passed between terminals.
`src/lib/offering.ts` holds what is yours to decide and `src/lib/find.ts` reads
everything else back through the platform's own routes.

**One client per service account.** `src/lib/client.ts` builds a client from the
key of the account making the call. There is no `X-Participant` header: the
party a call concerns is named in the body.

**A 202 is a receipt, not an outcome.** Every write that returns
`{ transactionId, status, statusUrl }` goes through `settle()` in
`src/lib/wait.ts`, which waits for a terminal state and refuses anything that is
not `COMPLETED`. Both the transaction id and the terminal state are printed.

**Every write asks for the handle.** The SDK sends `Prefer: wait=99` on every
mutation unless you say otherwise, which holds the request open until the chain
settles and answers with the finished resource. `src/lib/client.ts` sends
`Prefer: respond-async` instead, so a write answers with the 202 handle and the
flow follows it. Both are correct; asking for the handle is what lets one
settlement job submit many writes and follow them all.

**A read decides whether to write; the key is the backstop.** Every flow asks
the platform what it already holds and writes only what is missing, because that
is the check your own backend can make after any kind of failure. Every write
still carries an idempotency key derived from a stable local id, which covers the
window between the read and the write. The key alone is not enough: the platform
records a key the moment it accepts a request, so a key spent by a request whose
write never reached the chain replays as success forever. The register does not
lie that way.

**Amounts are base units.** A mint amount, a supply cap and a simulated transfer
are integer decimal strings in the token's base units. `src/lib/units.ts` does
that conversion in one place.

## Two things this workspace does not do

**The document bytes.** Flow 4 asks for a presigned upload target and stops
there. Putting the bytes on the presigned URL is a plain `PUT` to object
storage, outside the platform API and with no SDK method, so this workspace does
not make that call. Do it from your own backend, then record the document with
the same `objectKey`; the flow carries that call as a comment. Confirming before
the bytes land answers `DALP-0326`, because the platform reads the object back
before it records anything.

**The transfer simulation.** `transfer-simulate` arrived with DALP 3.2 and this
workspace pins `@settlemint/dalp-sdk` to the 3.1 line the sandbox runs. The 3.1
contract carries no such procedure, so the call does not exist on the client and
would not compile. Flows 6 and 7 run the `recipient-eligibility` pre-filter,
which the 3.1 contract does carry, and write the 3.2 call out as a comment next
to it. Move the pin to 3.2 against a 3.2 platform and the comment is the code.

## What a sandbox taught these examples

Every flow here ran against a live 3.1 sandbox, and five things about that
platform are not obvious from the routes alone.

**A new user is `PENDING`, not `NOT_REGISTERED`.** `user.create` already deploys
the identity contract, so the status right after it is `PENDING`: the identity
exists but the registry does not carry it. Registering is what writes the
country and moves it to `ACTIVE`, and nothing counts until it is: a claim will
not attach, and a mint to that wallet reverts with "Recipient not verified".
Flows 2 and 3 therefore register unless the status is already `ACTIVE`.

**A new instrument comes from a template.** The fixed legacy types (bond,
equity, fund, stablecoin and the rest) are still served for tokens that already
exist, but creating a new one needs `features.legacyAssetCreation`. A new token
is `type: "dalp-asset"` plus a `templateId` from
`settings.assetTypeTemplates.list`.

**The offering ceiling is a compliance module.** `token.setCap` encodes
`ISMARTCapped.setCap`, an interface baked into the contract at compile time. A
template asset does not carry it and the platform answers `DALP-0025
TOKEN_INTERFACE_NOT_SUPPORTED`. The ceiling that does apply is the `capped-v2`
compliance module, installed in `initialModulePairs` at creation.

**The KYC claim value is a hash, not a word.** A `knowYourCustomer` claim must
carry the `contentHash` of the approved KYC version, which binds it on chain to
the exact record a reviewer approved; issuing anything else answers `DALP-0271`.
Every other investor topic is a boolean auto-claim and takes the literal
`"true"`. That is why flow 3 drafts, submits and approves a KYC profile version
before it issues either claim.

**A price feed goes stale.** `token.price` reads the feed and refuses an
observation older than the active PriceResolver policy allows, answering
`DALP-0335`. An offering that has been open for days therefore cannot confirm its
own price through that route. `token.list` reports the registered base price
without consulting the feed, which is what flow 5 reads when it finds the price
already set.

**A counterfactual smart wallet cannot sign.** If the service account's smart
wallet has never been deployed, every queued write dead-letters with "smart
wallet is counterfactual but missing participant identity metadata". Set
`DALP_EXECUTOR=eoa` and the account's own key signs instead.
