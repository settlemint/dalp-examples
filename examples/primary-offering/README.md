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
```

The flows run in order. Each one appends the ids it created to
`src/lib/state.json`, which the next one reads, so nothing has to be pasted
between terminals. Delete that file to start a fresh run.

A run that dies partway leaves its idempotency keys spent. The platform records
a key when it accepts the request, so a flow re-run after a dropped connection is
answered from that record and does no work: the replay reports success while the
write it stands for never reached the chain. Flow 8 then says the round already
settled, or the mint refuses because the unpause it replayed never happened.
Start the next offering with a new symbol rather than trying to finish the old
one.

A second run needs new names. `user.create` is unique on email and answers 409
for one it already knows, and an idempotency key does not change that, so pass a
fresh address to flows 2 and 3. Flow 4 takes the symbol the same way, and a new
symbol is a new instrument: `bun run flow:04 POCB`.

```bash
bun run flow:01
bun run flow:02
bun run flow:03 alice@primary-offering.example
bun run flow:03 bob@primary-offering.example   # run it twice: flow 8 mints to two recipients
bun run flow:04
bun run flow:05
bun run flow:06
bun run flow:07
bun run flow:08
bun run flow:09
```

## The nine flows

| Flow | Script                          | Service account                                            | What it does                                                                                                                                                                 |
| ---- | ------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `src/01-bootstrap-check.ts`     | `DALP_REPORTING_KEY`                                       | Confirms the KYC and AML topic schemes exist and a trusted issuer is registered for both. Exits non-zero if not.                                                             |
| 2    | `src/02-issuer-onboarding.ts`   | `DALP_OPERATOR_KEY`                                        | Creates the issuer user, wallet and identity, registers the identity, confirms the registration.                                                                             |
| 3    | `src/03-investor-onboarding.ts` | `DALP_OPERATOR_KEY`, then `DALP_KYC_KEY`                   | The same, plus the KYC and AML claims signed onto the identity by the claim issuer.                                                                                          |
| 4    | `src/04-create-asset.ts`        | `DALP_ISSUER_KEY`                                          | Deploys the token paused with zero supply, grants settlement its roles, installs the identity-verification rule and the offering ceiling, asks for a document upload target. |
| 5    | `src/05-go-live-price.ts`       | `DALP_ISSUER_KEY`                                          | Stores the offering price and reads it back.                                                                                                                                 |
| 6    | `src/06-order-eligibility.ts`   | `DALP_REPORTING_KEY`                                       | The registry pre-filter on every candidate. The authoritative transfer simulation needs DALP 3.2 and is carried as a comment.                                                |
| 7    | `src/07-allocation-recheck.ts`  | `DALP_REPORTING_KEY`                                       | Re-checks every approved allocation line immediately before settlement and writes it for flow 8. The 3.2 re-simulation is carried as a comment.                              |
| 8    | `src/08-settlement.ts`          | `DALP_SETTLEMENT_KEY`                                      | Unpauses, mints the allocation, reads the transaction record, and shows the replay answering with that same mint instead of a second one.                                    |
| 9    | `src/09-after-settlement.ts`    | `DALP_REPORTING_KEY`, one write from `DALP_SETTLEMENT_KEY` | Reads the holder register now and at the mint block, then pauses the token again.                                                                                            |

## What every script does the same way

**The SDK is the only client.** Every call goes through `@settlemint/dalp-sdk`.
There is no `fetch`, no hand-built HTTP client and no REST path anywhere in
`src/`.

**Every response type comes from the SDK.** No request or response shape is
written by hand. The pin is `3.1.20`, the first published release whose `.d.ts`
files are self-contained; up to `3.1.19` they re-exported an unpublished
workspace package, which under `skipLibCheck` silently degraded the client to
`any` and left every call unchecked.

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

**Every write carries an idempotency key** derived from a stable local id, so
re-running a flow does not double-write. Flow 8 makes this visible: it sends the
same mint twice under one key and the second call answers with the first mint's
result, carrying the same transaction hash and the same total supply.

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

**A counterfactual smart wallet cannot sign.** If the service account's smart
wallet has never been deployed, every queued write dead-letters with "smart
wallet is counterfactual but missing participant identity metadata". Set
`DALP_EXECUTOR=eoa` and the account's own key signs instead.
