/**
 * Flow 4 — Create the asset (svc-issuer).
 *
 * The token is born paused with zero supply, carrying the roles settlement will
 * need and the compliance rule that makes the KYC and AML claims from flow 3
 * count. Nothing can move until flow 8 unpauses it.
 *
 * It is created as an equity because that needs no other token to exist first.
 * A bond additionally needs `denominationAsset`, the address of the token its
 * principal and coupons are paid in, so it needs a second instrument deployed.
 *
 * The settlement key is read here for one thing only: the wallet the
 * supplyManagement and emergency roles are granted to.
 */

import { clientFor, heading } from "./lib/client.ts";
import type {
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

/** Compliance expressions are postfix node lists: TOPIC is 0, AND is 1. */
const TOPIC_NODE = 0;
const AND_NODE = 1;

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

const dalp = clientFor("issuer");
heading("Flow 4 — Create the asset", "issuer");

const settlementAccount: CurrentUser = await clientFor("settlement").user.me({});
console.log(`  settlement wallet ${settlementAccount.data.wallet}`);

const modules: SystemComplianceModules = await dalp.system.compliance.list({ query: {} });
const identityVerification = modules.data.find((row) => row.typeId === "identity-verification");
if (identityVerification === undefined) {
  throw new Error("This platform has no identity-verification compliance module deployed.");
}

const schemes: TopicSchemes = await dalp.directory.topicSchemes.list({ query: {} });
const topicIds = ["knowYourCustomer", "antiMoneyLaundering"].map((topic) => {
  const scheme = schemes.data.find((row) => key(row.name) === key(topic));
  if (scheme === undefined) {
    throw new Error(`Topic scheme ${topic} is not registered on this platform. Run flow:01.`);
  }
  return scheme.topicId;
});

const created = await dalp.token.create(
  {
    body: {
      type: "equity",
      name: "Primary Offering Class A",
      symbol: "POCA",
      decimals: DECIMALS,
      countryCode: "784",
      basePrice: "100.00",
      priceCurrency: "AED",
      initialPermissions: [
        { account: settlementAccount.data.wallet, roles: ["supplyManagement", "emergency"] },
      ],
      // "holds the KYC claim AND holds the AML claim", in postfix form.
      initialModulePairs: [
        {
          typeId: "identity-verification",
          module: identityVerification.module,
          values: [
            ...topicIds.map((topicId) => ({ nodeType: TOPIC_NODE, value: topicId })),
            { nodeType: AND_NODE },
          ],
        },
      ],
    },
  },
  { context: { idempotencyKey: "pof-token-create-POCA" } },
);
const deployTransaction = await settle(dalp, created, "token deployment");
if (deployTransaction === undefined) {
  throw new Error("Token creation answered inline; this example expects the queued path.");
}

const deployment: TransactionStatus = await dalp.transaction.status({
  params: { transactionId: deployTransaction },
});
const tokenAddress = deployment.data.result?.tokenAddress;
if (tokenAddress === undefined) {
  throw new Error("The completed deployment carried no token address.");
}
console.log(`  token ${tokenAddress}`);

const cap = await dalp.token.setCap(
  { params: { tokenAddress }, body: { newCap: baseUnits(OFFERING_SIZE, DECIMALS) } },
  { context: { idempotencyKey: `pof-cap-${tokenAddress}` } },
);
await settle(dalp, cap, `supply cap ${OFFERING_SIZE} units`);

const upload: UploadTarget = await dalp.token.documents.getUploadUrl({
  params: { tokenAddress },
  body: PROSPECTUS,
});
console.log(`  presigned upload ${upload.data.objectKey}`);
// Putting the bytes on upload.data.uploadUrl is a plain PUT to object storage,
// outside the platform API and with no SDK method, so this example does not make
// it. Do that PUT yourself, then record the document with the same objectKey:
const document = await dalp.token.documents.confirmUpload(
  { params: { tokenAddress }, body: { ...PROSPECTUS, objectKey: upload.data.objectKey } },
  { context: { idempotencyKey: `pof-document-${upload.data.objectKey}` } },
);
await settle(dalp, document, "prospectus recorded");

const installed: TokenComplianceModules = await dalp.token.compliance({ params: { tokenAddress } });
console.log(`  compliance modules on the token: ${installed.data.complianceModuleConfigs.length}`);
for (const config of installed.data.complianceModuleConfigs) {
  console.log(`    ${config.complianceModule.typeId} (active: ${config.isActive})`);
}

writeState({ token: { address: tokenAddress, decimals: DECIMALS } });
console.log("\nAsset created, paused, zero supply. Run flow:05 next.");
