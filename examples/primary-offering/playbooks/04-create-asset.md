---
title: "Playbook 4 — Create the asset"
subtitle: "Service account: issuer (one read with the settlement key)"
---

# Playbook 4 — Create the asset

- **SDK source:** `src/04-create-asset.ts`
- **Service account:** `svc-issuer` (`$DALP_ISSUER_KEY`). One read uses
  `$DALP_SETTLEMENT_KEY`, only to learn the settlement account's wallet.

The token is born **paused with zero supply**, carrying the roles settlement
will need and the compliance rule that makes the KYC and AML claims from
playbook 3 count. Nothing can move until playbook 8 unpauses it. No price is set
here; that is playbook 5.

| Step | Call                                                                  | Account    | SDK procedure                      |
| ---- | --------------------------------------------------------------------- | ---------- | ---------------------------------- |
| 1    | `GET /tokens?filter[symbol]=…`                                        | issuer     | `token.list`                       |
| 2    | `GET /users/me`                                                       | settlement | `user.me`                          |
| 3    | `GET /settings/asset-type-templates`                                  | issuer     | `settings.assetTypeTemplates.list` |
| 4    | `GET /system/compliance-modules`                                      | issuer     | `system.compliance.list`           |
| 5    | `GET /system/claim-topics`                                            | issuer     | `system.claimTopics.list`          |
| 6    | `POST /tokens`                                                        | issuer     | `token.create`                     |
| 7    | `GET /transaction-requests/{transactionId}`                           | issuer     | `transaction.status`               |
| 8    | `POST /tokens/{tokenAddress}/document-uploads`                        | issuer     | `token.documents.getUploadUrl`     |
| 9    | `PUT` to object storage, then `POST /tokens/{tokenAddress}/documents` | issuer     | `token.documents.confirmUpload`    |
| 10   | `GET /tokens/{tokenAddress}/compliance-modules`                       | issuer     | `token.compliance`                 |

Steps 2–7 run only when step 1 finds no token under the symbol.

## Step 1 — Is the symbol already listed?

**Purpose.** One symbol is one instrument. A second run must report the token
that exists instead of deploying another.

**Called by.** issuer.

```bash
curl -sS -G "$DALP_API/tokens" \
  --data-urlencode "filter[symbol]=POCA" \
  -H "X-Api-Key: $DALP_ISSUER_KEY"
```

**Key response fields** (`data[]`):

| Field                                | Meaning                                                          |
| ------------------------------------ | ---------------------------------------------------------------- |
| `id`                                 | **The token address.** Keep it as `$TOKEN`.                      |
| `symbol`                             | Confirm it equals the symbol you searched for.                   |
| `decimals`                           | Needed to convert amounts to base units.                         |
| `pausable.paused`                    | Whether the token is paused.                                     |
| `totalSupply`                        | In display units. `totalSupplyExact` is the base-unit integer.   |
| `basePrice`, `basePriceCurrencyCode` | The registered base price; `"0"` / `null` while no price is set. |

**Check before moving on.** If a row with the exact symbol exists, skip to
step 8 with its `id`.

## Step 2 — Read the settlement account's wallet

**Purpose.** The token grants `supplyManagement` and `emergency` to the
settlement account at creation. This is the only call made with the settlement
key in this playbook.

```bash
curl -sS "$DALP_API/users/me" \
  -H "X-Api-Key: $DALP_SETTLEMENT_KEY"
```

**Key response fields** (`data`): `wallet` — keep it as `$SETTLEMENT_WALLET`.
`signingAddress` is the account's own signing key (EOA); `wallet` is its smart
wallet.

**Check before moving on.** If `wallet` is `null`, the service account has no
smart wallet yet. Open the account once in the Console, then retry.

You do not have to choose between the two addresses. When the platform grants
`initialPermissions`, it resolves the address to the account behind it and
grants the roles to **every wallet of that account**, smart wallet and signing
key alike. The roles therefore apply whichever of the two ends up signing
(see `X-Executor` in the introduction).

## Step 3 — Pick the asset template

**Purpose.** A new instrument comes from a template. The legacy fixed types
(`bond`, `equity`, `fund`, …) are still served for existing tokens, but creating
a new one requires the platform to opt in to legacy asset creation. A new token
is `type: "dalp-asset"` plus a `templateId`.

**Called by.** issuer.

```bash
curl -sS "$DALP_API/settings/asset-type-templates" \
  -H "X-Api-Key: $DALP_ISSUER_KEY"
```

**Key response fields** (`data[]`): `id` (for example `system-equity`), `name`,
`baseAssetType`, `isDraft`, `requiredFeatures`.

**Check before moving on.** The template you want (the example uses
`system-equity`) is in the list and is not a draft.

## Step 4 — Find the compliance module addresses

**Purpose.** Each compliance module you install at creation is referenced by its
deployed address.

**Called by.** issuer.

```bash
curl -sS "$DALP_API/system/compliance-modules" \
  -H "X-Api-Key: $DALP_ISSUER_KEY"
```

**Key response fields** (`data[]`): `typeId` and `module` (the address).

**Check before moving on.** Keep the `module` address for
`identity-verification` (`$IDV_MODULE`) and for `capped-v2` (`$CAP_MODULE`). If
either is missing, the platform has not deployed that module: stop.

## Step 5 — Resolve the KYC and AML topic ids

Same call as playbook 1, step 1, with the issuer key. Keep the two `topicId`
values as `$KYC_TOPIC_ID` and `$AML_TOPIC_ID`.

```bash
curl -sS "$DALP_API/system/claim-topics" \
  -H "X-Api-Key: $DALP_ISSUER_KEY"
```

## Step 6 — Create the token

**Called by.** issuer.

```bash
curl -sS -X POST "$DALP_API/tokens" \
  -H "X-Api-Key: $DALP_ISSUER_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -H "Idempotency-Key: pof-token-create-POCA" \
  -d @- <<JSON
{
  "type": "dalp-asset",
  "templateId": "system-equity",
  "name": "Primary Offering POCA",
  "symbol": "POCA",
  "decimals": 18,
  "countryCode": "784",
  "initialPermissions": [
    { "account": "$SETTLEMENT_WALLET",
      "roles": ["supplyManagement", "emergency"] }
  ],
  "initialModulePairs": [
    {
      "typeId": "identity-verification",
      "module": "$IDV_MODULE",
      "values": [
        { "nodeType": 0, "value": "$KYC_TOPIC_ID" },
        { "nodeType": 1, "value": "0" },
        { "nodeType": 0, "value": "$AML_TOPIC_ID" }
      ]
    },
    {
      "typeId": "capped-v2",
      "module": "$CAP_MODULE",
      "values": { "maxSupply": "1000000000000000000000000" }
    }
  ]
}
JSON
```

| Body field           | Meaning                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`               | Always `dalp-asset` for a template asset.                                                                                                         |
| `templateId`         | The template id from step 3.                                                                                                                      |
| `name`               | Max 50 characters.                                                                                                                                |
| `symbol`             | Upper-case letters and digits only, max 24 characters.                                                                                            |
| `decimals`           | The token's decimals (`18`).                                                                                                                      |
| `countryCode`        | ISO 3166-1 **numeric** code, as a string. `784` is the United Arab Emirates. (Identity registration uses the alpha-2 code instead.)               |
| `initialPermissions` | Token roles granted at creation. Allowed roles: `admin`, `custodian`, `emergency`, `fundsManager`, `governance`, `saleAdmin`, `supplyManagement`. |
| `initialModulePairs` | The compliance modules installed at creation: `typeId`, `module` address, and module-specific `values`.                                           |
| `unpauseOnCreation`  | Omitted here. It defaults to `false`, which is what leaves the token **paused**.                                                                  |

**The identity-verification expression.** `values` is the rule "holds the KYC
claim **AND** holds the AML claim", written in the order you would say it
(infix). Node types: `0` = TOPIC, `1` = AND, `2` = OR, `3` = NOT. A TOPIC node's
`value` is the numeric topic id; an operator node's `value` is `"0"`. The
literal strings `"("` and `")"` may be used as array items to group.

**The offering ceiling.** `capped-v2` refuses any mint that would carry total
supply past `maxSupply`, in **base units**: 1,000,000 units × 10^18 =
`"1000000000000000000000000"`. Do not use the token's `setCap` route for a
template asset: it answers `DALP-0025 TOKEN_INTERFACE_NOT_SUPPORTED`.

**Response.** `202` with `{ transactionId, status, statusUrl }`. The platform
may instead answer inline with the token (`data.id` is the address).

`DALP-0318` (`TOKEN_CREATE_USER_ADDRESS_DOES_NOT_ASSOCIATED_IDENTITY_CONTRACT`)
means the **issuer service account itself** has no on-chain identity yet. Create
one with `POST /identities` using the issuer key, wait for it to complete, and
send the create again. This is a one-time setup step, described in the
introduction.

## Step 7 — Wait for the deployment and read the token address

**Called by.** issuer.

```bash
curl -sS "$DALP_API/transaction-requests/$TX_ID" \
  -H "X-Api-Key: $DALP_ISSUER_KEY"
```

**Key response fields** (`data`): `status`, and **`result.tokenAddress`** once
`COMPLETED` — keep it as `$TOKEN`.

**Check before moving on.** A token deployment is a workflow, not one chain
write: it submits the contract and the compliance modules in sequence. Allow up
to **ten minutes** before treating it as timed out. Continue only on
`COMPLETED` with a `result.tokenAddress`.

## Step 8 — Ask for a presigned upload target for the prospectus

**Called by.** issuer. Answers inline.

```bash
curl -sS -X POST "$DALP_API/tokens/$TOKEN/document-uploads" \
  -H "X-Api-Key: $DALP_ISSUER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "documentType": "prospectus",
    "fileName": "prospectus.pdf",
    "fileSize": 12345,
    "mimeType": "application/pdf",
    "visibility": "public",
    "title": "Offering prospectus"
  }'
```

| Body field   | Meaning                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `fileSize`   | The exact size of the file in bytes.                                                           |
| `mimeType`   | `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, or the Word / Excel OpenXML types. |
| `visibility` | `public`, `holders` or `restricted`.                                                           |

**Key response fields** (`data`):

| Field       | Meaning                                                   |
| ----------- | --------------------------------------------------------- |
| `uploadUrl` | The presigned URL to upload the bytes to.                 |
| `method`    | Always `PUT`.                                             |
| `headers`   | Headers you **must** send with the upload.                |
| `objectKey` | **Keep it.** It identifies the uploaded object in step 9. |
| `expiresAt` | The upload URL stops working at this time.                |

## Step 9 — Upload the bytes, then record the document

The SDK example stops after step 8, because the upload is a plain HTTP `PUT` to
object storage, outside the platform API. From a REST client you can complete
it.

Upload — **no `X-Api-Key`** on this call, which goes to object storage and not
to DALP. Send exactly the headers from step 8 (`data.headers`, in practice the
`Content-Type`). Success is a plain `200` with an empty body:

```bash
curl -sS -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/pdf" \
  --data-binary @prospectus.pdf
```

Record the document — same metadata as step 8, plus the `objectKey`:

```bash
curl -sS -X POST "$DALP_API/tokens/$TOKEN/documents" \
  -H "X-Api-Key: $DALP_ISSUER_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: pof-document-$OBJECT_KEY" \
  -d @- <<JSON
{
  "objectKey": "$OBJECT_KEY",
  "documentType": "prospectus",
  "fileName": "prospectus.pdf",
  "fileSize": 12345,
  "mimeType": "application/pdf",
  "visibility": "public",
  "title": "Offering prospectus"
}
JSON
```

**Key response fields** (`data`): `id`, `versionNumber`, `isLatest`, `fileHash`.

**Check before moving on.** Recording before the bytes have landed answers
`DALP-0326`: the platform reads the object back and refuses to record a document
that is not there.

## Step 10 — Confirm the compliance modules on the token

**Called by.** issuer.

```bash
curl -sS "$DALP_API/tokens/$TOKEN/compliance-modules" \
  -H "X-Api-Key: $DALP_ISSUER_KEY"
```

**Key response fields** (`data.complianceModuleConfigs[]`):
`complianceModule.typeId`, `isActive`, `instanceAddress`.

**Check before moving on.** Both `identity-verification` and `capped-v2` are
listed. `isActive` can be absent or `null` for a module (it was for
`identity-verification` on the sandbox); the module is attached and enforced all
the same, so test for presence in the list, not for `isActive == true`.

## Outcome

The instrument is listed and rests paused with zero supply. Continue with
playbook 5.
