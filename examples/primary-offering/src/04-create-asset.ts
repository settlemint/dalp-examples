/**
 * Flow 4 — Create the asset (svc-issuer).
 *
 * The token is born paused with zero supply, carrying the roles settlement will
 * need and the compliance rule that makes the KYC and AML claims from flow 3
 * count. Nothing can move until flow 8 unpauses it.
 *
 * The symbol is read back first. One symbol is one instrument, so a second run
 * reports the token that is already listed instead of deploying another.
 *
 * The instrument comes from a template. The fixed legacy types (bond, equity,
 * fund, stablecoin and the rest) are still served for tokens that already exist,
 * but a platform refuses to create a new one unless it opts in with
 * `features.legacyAssetCreation`. A new token is `type: "dalp-asset"` plus the
 * id of the template that shapes it.
 *
 * No price is set here. The token is created without a base-price feed, so
 * `token.price` has nothing to answer until flow 5 registers one; that is the
 * moment the offering goes live.
 *
 * The offering size is a compliance module, not a supply cap. `token.setCap`
 * encodes `ISMARTCapped.setCap`, and that interface is baked into the contract
 * at compile time; a template asset does not carry it, so the platform answers
 * DALP-0025 TOKEN_INTERFACE_NOT_SUPPORTED. The ceiling that does apply to a
 * template asset is the `capped-v2` compliance module, installed here at
 * creation.
 */

import { clientFor, heading } from "./lib/client.ts";
import { findInstrument, topicIdFor } from "./lib/find.ts";
import { OFFERING_SIZE, SYMBOL } from "./lib/offering.ts";
import { baseUnits, trimZeros } from "./lib/units.ts";
import { settle } from "./lib/wait.ts";

/** Compliance expressions are written infix. TOPIC is node type 0, AND is 1. */
const TOPIC_NODE = 0;
const AND_NODE = 1;

const TEMPLATE = "system-equity";
const DECIMALS = 18;
const PROSPECTUS = {
  documentType: "prospectus",
  fileName: "prospectus.pdf",
  fileSize: 12_345,
  mimeType: "application/pdf",
  visibility: "public",
  title: "Offering prospectus",
} as const;

const dalp = clientFor("issuer");
heading("Flow 4 — Create the asset", "issuer");

/** Deploy the instrument and return the address the platform gave it. */
async function deploy(): Promise<string> {
  // The settlement key is read here for one thing only: the wallet the
  // supplyManagement and emergency roles are granted to.
  const settlementAccount = await clientFor("settlement").user.me({});
  const settlementWallet = settlementAccount.data.wallet;
  if (settlementWallet === null || settlementWallet === undefined) {
    throw new Error("The settlement service account has no wallet. Open it once in the Console.");
  }
  console.log(`  settlement wallet ${settlementWallet}`);

  const templates = await dalp.settings.assetTypeTemplates.list({ query: {} });
  const template = templates.data.find((row) => row.id === TEMPLATE);
  if (template === undefined) {
    throw new Error(
      `This platform carries no ${TEMPLATE} template. Pick one from settings.assetTypeTemplates.list.`,
    );
  }
  console.log(`  template ${template.id} (${template.name})`);

  const modules = await dalp.system.compliance.list({ query: {} });
  const moduleAddress = (typeId: string): string => {
    const row = modules.data.find((entry) => entry.typeId === typeId);
    if (row === undefined) {
      throw new Error(`This platform has no ${typeId} compliance module deployed.`);
    }
    return row.module;
  };

  const created = await dalp.token.create(
    {
      body: {
        type: "dalp-asset",
        templateId: template.id,
        name: `Primary Offering ${SYMBOL}`,
        symbol: SYMBOL,
        decimals: DECIMALS,
        countryCode: "784",
        initialPermissions: [
          { account: settlementWallet, roles: ["supplyManagement", "emergency"] },
        ],
        // "holds the KYC claim AND holds the AML claim", written the way you
        // would say it. Every node carries a value; the operators use "0".
        initialModulePairs: [
          {
            typeId: "identity-verification",
            module: moduleAddress("identity-verification"),
            values: [
              { nodeType: TOPIC_NODE, value: await topicIdFor(dalp, "knowYourCustomer") },
              { nodeType: AND_NODE, value: "0" },
              { nodeType: TOPIC_NODE, value: await topicIdFor(dalp, "antiMoneyLaundering") },
            ],
          },
          // The offering size. `capped-v2` refuses any mint that would carry
          // total supply past maxSupply, in base units.
          {
            typeId: "capped-v2",
            module: moduleAddress("capped-v2"),
            values: { maxSupply: baseUnits(OFFERING_SIZE, DECIMALS) },
          },
        ],
      },
    },
    { context: { idempotencyKey: `pof-token-create-${SYMBOL}` } },
  );
  // A create either answers inline with the deployed token or hands back a
  // queue handle; the address is read from whichever arrived.
  const deployTransaction = await settle(dalp, created, "token deployment");
  let tokenAddress = "data" in created ? created.data.id : undefined;
  if (tokenAddress === undefined && deployTransaction !== undefined) {
    const deployment = await dalp.transaction.status({
      params: { transactionId: deployTransaction },
    });
    tokenAddress = deployment.data.result?.tokenAddress;
  }
  if (tokenAddress === undefined) {
    throw new Error("The deployment carried no token address.");
  }
  console.log(`  token ${tokenAddress}`);
  return tokenAddress;
}

const listed = await findInstrument(dalp, SYMBOL);
if (listed !== undefined) {
  console.log(
    `  ${SYMBOL} is already listed at ${listed.address}, supply ${trimZeros(listed.totalSupply)}`,
  );
}
const tokenAddress = listed?.address ?? (await deploy());

const upload = await dalp.token.documents.getUploadUrl({
  params: { tokenAddress },
  body: PROSPECTUS,
});
console.log(`  presigned upload ${upload.data.objectKey}`);
// The example stops one step short here, on purpose. Putting the bytes on
// upload.data.uploadUrl is a plain PUT to object storage: no SDK method wraps
// it, and these examples make no HTTP call of their own. Make that PUT from your
// own backend, then record the document with the same objectKey:
//
//   await dalp.token.documents.confirmUpload(
//     { params: { tokenAddress }, body: { ...PROSPECTUS, objectKey: upload.data.objectKey } },
//     { context: { idempotencyKey: `pof-document-${upload.data.objectKey}` } },
//   );
//
// Calling it before the bytes land answers DALP-0326: the platform reads the
// object back and refuses to record a document that is not there.

const installed = await dalp.token.compliance({ params: { tokenAddress } });
console.log(`  compliance modules on the token: ${installed.data.complianceModuleConfigs.length}`);
for (const config of installed.data.complianceModuleConfigs) {
  const state = config.isActive === undefined ? "attached" : `active: ${config.isActive}`;
  console.log(`    ${config.complianceModule.typeId} (${state})`);
}

console.log("\nThe instrument is listed and rests paused. Run flow:05 next.");
