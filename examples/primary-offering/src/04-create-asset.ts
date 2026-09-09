/**
 * Flow 4 — Create the asset (svc-issuer).
 *
 * The token is born paused with zero supply, carrying the roles settlement will
 * need and the compliance rule that makes the KYC and AML claims from flow 3
 * count. Nothing can move until flow 8 unpauses it.
 *
 * The instrument comes from a template. The fixed legacy types (bond, equity,
 * fund, stablecoin and the rest) are still served for tokens that already exist,
 * but a platform refuses to create a new one unless it opts in with
 * `features.legacyAssetCreation`. A new token is `type: "dalp-asset"` plus the
 * id of the template that shapes it.
 *
 * The offering size is a compliance module, not a supply cap. `token.setCap`
 * encodes `ISMARTCapped.setCap`, and that interface is baked into the contract
 * at compile time; a template asset does not carry it, so the platform answers
 * DALP-0025 TOKEN_INTERFACE_NOT_SUPPORTED. The ceiling that does apply to a
 * template asset is the `capped-v2` compliance module, installed here at
 * creation.
 *
 * The settlement key is read here for one thing only: the wallet the
 * supplyManagement and emergency roles are granted to.
 */

import { clientFor, heading } from "./lib/client.ts";
import type {
  AssetTypeTemplates,
  CreatedToken,
  CurrentUser,
  SystemComplianceModules,
  TokenComplianceModules,
  TopicSchemes,
  TransactionStatus,
  UploadTarget,
} from "./lib/responses.ts";
import { writeState } from "./lib/state.ts";
import { baseUnits } from "./lib/units.ts";
import { settle } from "./lib/wait.ts";

/** Compliance expressions are written infix. TOPIC is node type 0, AND is 1. */
const TOPIC_NODE = 0;
const AND_NODE = 1;

const TEMPLATE = "system-equity";
const DECIMALS = 18;
const OFFERING_SIZE = "1000000";
const PROSPECTUS = {
  documentType: "prospectus",
  fileName: "prospectus.pdf",
  fileSize: 12_345,
  mimeType: "application/pdf",
  visibility: "public",
  title: "Offering prospectus",
} as const;

const key = (name: string): string => name.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");

// A symbol is a new instrument. Pass one to create a second offering.
const symbol = process.argv[2] ?? "POCA";
const dalp = clientFor("issuer");
heading("Flow 4 — Create the asset", "issuer");

const settlementAccount: CurrentUser = await clientFor("settlement").user.me({});
console.log(`  settlement wallet ${settlementAccount.data.wallet}`);

const templates: AssetTypeTemplates = await dalp.settings.assetTypeTemplates.list({ query: {} });
const template = templates.data.find((row) => row.id === TEMPLATE);
if (template === undefined) {
  throw new Error(
    `This platform carries no ${TEMPLATE} template. Pick one from settings.assetTypeTemplates.list.`,
  );
}
console.log(`  template ${template.id} (${template.name})`);

const modules: SystemComplianceModules = await dalp.system.compliance.list({ query: {} });
const moduleAddress = (typeId: string): string => {
  const row = modules.data.find((entry) => entry.typeId === typeId);
  if (row === undefined) {
    throw new Error(`This platform has no ${typeId} compliance module deployed.`);
  }
  return row.module;
};

const schemes: TopicSchemes = await dalp.system.claimTopics.list({ query: {} });
const [kycTopic, amlTopic] = ["knowYourCustomer", "antiMoneyLaundering"].map((topic) => {
  const scheme = schemes.data.find((row) => key(row.name) === key(topic));
  if (scheme === undefined) {
    throw new Error(`Claim topic ${topic} is not registered on this platform. Run flow:01.`);
  }
  return scheme.topicId;
});

const created: CreatedToken = await dalp.token.create(
  {
    body: {
      type: "dalp-asset",
      templateId: template.id,
      name: `Primary Offering ${symbol}`,
      symbol,
      decimals: DECIMALS,
      countryCode: "784",
      basePrice: "100.00",
      priceCurrency: "AED",
      initialPermissions: [
        { account: settlementAccount.data.wallet, roles: ["supplyManagement", "emergency"] },
      ],
      // "holds the KYC claim AND holds the AML claim", written the way you would
      // say it. Every node carries a value; the operators use "0".
      initialModulePairs: [
        {
          typeId: "identity-verification",
          module: moduleAddress("identity-verification"),
          values: [
            { nodeType: TOPIC_NODE, value: kycTopic },
            { nodeType: AND_NODE, value: "0" },
            { nodeType: TOPIC_NODE, value: amlTopic },
          ],
        },
        // The offering size. `capped-v2` refuses any mint that would carry total
        // supply past maxSupply, in base units.
        {
          typeId: "capped-v2",
          module: moduleAddress("capped-v2"),
          values: { maxSupply: baseUnits(OFFERING_SIZE, DECIMALS) },
        },
      ],
    },
  },
  { context: { idempotencyKey: `pof-token-create-${symbol}` } },
);
// A create either answers inline with the deployed token or hands back a queue
// handle; the address is read from whichever arrived.
const deployTransaction = await settle(dalp, created, "token deployment");
let tokenAddress = created.data?.id;
if (tokenAddress === undefined && deployTransaction !== undefined) {
  const deployment: TransactionStatus = await dalp.transaction.status({
    params: { transactionId: deployTransaction },
  });
  tokenAddress = deployment.data.result?.tokenAddress;
}
if (tokenAddress === undefined) {
  throw new Error("The deployment carried no token address.");
}
console.log(`  token ${tokenAddress}`);

const upload: UploadTarget = await dalp.token.documents.getUploadUrl({
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

const installed: TokenComplianceModules = await dalp.token.compliance({ params: { tokenAddress } });
console.log(`  compliance modules on the token: ${installed.data.complianceModuleConfigs.length}`);
for (const config of installed.data.complianceModuleConfigs) {
  const state = config.isActive === undefined ? "attached" : `active: ${config.isActive}`;
  console.log(`    ${config.complianceModule.typeId} (${state})`);
}

writeState({ token: { address: tokenAddress, decimals: DECIMALS } });
console.log("\nAsset created, paused, zero supply. Run flow:05 next.");
