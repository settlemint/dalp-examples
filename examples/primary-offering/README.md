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

| Flow | Script                          | Service account                                            | What it does                                                                                                                                       |
| ---- | ------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `src/01-bootstrap-check.ts`     | `DALP_REPORTING_KEY`                                       | Confirms the KYC and AML topic schemes exist and a trusted issuer is registered for both. Exits non-zero if not.                                   |
| 2    | `src/02-issuer-onboarding.ts`   | `DALP_OPERATOR_KEY`                                        | Creates the issuer user, wallet and identity, registers the identity, confirms the registration.                                                   |
| 3    | `src/03-investor-onboarding.ts` | `DALP_OPERATOR_KEY`, then `DALP_KYC_KEY`                   | The same, plus the KYC and AML claims signed onto the identity by the claim issuer.                                                                |
| 4    | `src/04-create-asset.ts`        | `DALP_ISSUER_KEY`                                          | Deploys the token paused with zero supply, grants settlement its roles, installs the identity-verification rule, sets the cap, records a document. |
| 5    | `src/05-go-live-price.ts`       | `DALP_ISSUER_KEY`                                          | Stores the offering price and reads it back.                                                                                                       |
| 6    | `src/06-order-eligibility.ts`   | `DALP_REPORTING_KEY`                                       | The registry pre-filter, then the authoritative transfer simulation. Needs DALP 3.2 for the second half.                                           |
| 7    | `src/07-allocation-recheck.ts`  | `DALP_REPORTING_KEY`                                       | Re-simulates every approved allocation line immediately before settlement. Needs DALP 3.2.                                                         |
| 8    | `src/08-settlement.ts`          | `DALP_SETTLEMENT_KEY`                                      | Unpauses, mints the allocation, reads the transaction record, and shows the replay returning the same transaction id.                              |
| 9    | `src/09-after-settlement.ts`    | `DALP_REPORTING_KEY`, one write from `DALP_SETTLEMENT_KEY` | Reads the holder register now and at the mint block, then pauses the token again.                                                                  |

## What every script does the same way

**The SDK is the only client.** Every call goes through `@settlemint/dalp-sdk`.
There is no `fetch`, no hand-built HTTP client and no REST path anywhere in
`src/`.

**One client per service account.** `src/lib/client.ts` builds a client from the
key of the account making the call. There is no `X-Participant` header: the
party a call concerns is named in the body.

**A 202 is a receipt, not an outcome.** Every write that returns
`{ transactionId, status, statusUrl }` goes through `settle()` in
`src/lib/wait.ts`, which waits for a terminal state and refuses anything that is
not `COMPLETED`. Both the transaction id and the terminal state are printed.

**Every write carries an idempotency key** derived from a stable local id, so
re-running a flow does not double-write. Flow 8 makes this visible: it sends the
same mint twice under one key and shows the second call returning the first
transaction id.

**Amounts are base units.** A mint amount, a supply cap and a simulated transfer
are integer decimal strings in the token's base units. `src/lib/units.ts` does
that conversion in one place.

## Two things this workspace does not do

**The document bytes.** Flow 4 asks for a presigned upload target and records
the document against the returned `objectKey`, both through the SDK. Putting the
bytes on the presigned URL is a plain `PUT` to object storage, outside the
platform API and with no SDK method, so this workspace does not make that call.
Do it yourself between the two, then record the document with the same key.

**Detecting the platform line.** `transfer-simulate` arrived with DALP 3.2. The
platform publishes no version route, and the client is a proxy that answers for
any property name, so the line cannot be probed. Set `DALP_PLATFORM_LINE` in
`.env`. On `3.1`, flows 6 and 7 print the notice and stop; flow 7 still writes
its allocation so flow 8 can settle it. `recipient-eligibility`, the pre-filter
half of flow 6, is carried by the 3.1 contract and runs on either line.

Setting `DALP_PLATFORM_LINE=3.2` also needs the `@settlemint/dalp-sdk` pin
moved to the 3.2 line. This workspace pins `3.1.19`, whose contract carries no
transfer-simulate procedure, so the client refuses that call locally before it
reaches the platform.
