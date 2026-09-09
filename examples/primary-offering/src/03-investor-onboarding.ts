/**
 * Flow 3 — Investor onboarding (svc-operator, then svc-kyc).
 *
 * Flow 2 again, registry entry and all, plus the two steps that matter.
 *
 * First the KYC profile: the platform keeps a reviewed record per user, and a
 * claim on a topic that requires one is refused until that record is approved.
 * Draft, submit, approve — the same three states your reviewer works through in
 * the Console, here from the claim issuer's key.
 *
 * Then the claims themselves. The compliance verdict is signed onto the
 * identity by the KYC service account, and from that moment the investor exists
 * on chain and can receive an allocation. The case file stays on your side;
 * only the verdict reaches the chain.
 *
 * Run it twice with different emails so flow 8 has two recipients:
 *   bun run flow:03 alice@primary-offering.example
 *   bun run flow:03 bob@primary-offering.example
 */

import { clientFor, heading } from "./lib/client.ts";
import type {
  ClaimEvents,
  CreatedUser,
  KycProfile,
  KycVersion,
  RegistrationStatus,
} from "./lib/responses.ts";
import { readState, writeState } from "./lib/state.ts";
import type { Party } from "./lib/state.ts";
import { settle } from "./lib/wait.ts";

const COUNTRY = "AE";

const email = process.argv[2] ?? "investor@primary-offering.example";
const operator = clientFor("operator");
const kyc = clientFor("kyc");
heading("Flow 3 — Investor onboarding", "operator");

const created: CreatedUser = await operator.user.create(
  { body: { email, name: "Primary Offering Investor" } },
  { context: { idempotencyKey: `pof-user-${email}` } },
);
console.log(`  user     ${created.data.id}`);
console.log(`  wallet   ${created.data.wallet}`);
console.log(`  identity ${created.data.identity}`);

const registered: RegistrationStatus = await operator.system.identity.registrationStatus({
  query: { wallet: created.data.wallet },
});
console.log(`  registration: ${registered.data.status}`);
// `user.create` already deploys the identity contract and queues it for the
// registry, so the status here is PENDING, not NOT_REGISTERED. Registering is
// what writes the country into the registry and moves it to ACTIVE; nothing
// downstream — no claim, no transfer, no mint — counts until it is ACTIVE.
if (registered.data.status !== "ACTIVE") {
  const registration = await operator.system.identity.register(
    { body: { wallet: created.data.wallet, country: COUNTRY } },
    { context: { idempotencyKey: `pof-register-${email}` } },
  );
  await settle(operator, registration, "identity registration");
}

// An approved version is unique on national id and country within the
// organization, so the identifier is derived from the investor's own address.
const draft: KycVersion = await kyc.user.kyc.versions.create({
  params: { userId: created.data.id },
  body: {
    userId: created.data.id,
    overwriteDraft: true,
    initialData: {
      firstName: "Primary",
      lastName: "Investor",
      dob: "1988-04-12T00:00:00.000Z",
      country: COUNTRY,
      residencyStatus: "resident",
      nationalId: `POF-${email}`,
    },
  },
});
await kyc.user.kyc.version.submit({ params: { versionId: draft.data.id }, body: {} });
const reviewed: KycVersion = await kyc.user.kyc.version.approve({
  params: { versionId: draft.data.id },
  body: {},
});
console.log(`  kyc profile version ${draft.data.versionNumber}: ${reviewed.data.status}`);

// The claim values are not free text. `knowYourCustomer` carries the content
// hash of the approved version, which binds the claim on chain to the exact
// record the reviewer approved; every other investor topic is a boolean
// auto-claim and takes the literal "true".
const profile: KycProfile = await kyc.user.kyc.profile.read({
  params: { userId: created.data.id },
});
const contentHash = profile.data.approvedVersion?.contentHash;
if (contentHash === null || contentHash === undefined) {
  throw new Error("The approved KYC version carries no content hash.");
}

/** The two verdicts the token's compliance rule will require at mint time. */
const verdicts = [
  { topic: "knowYourCustomer", claim: contentHash },
  { topic: "antiMoneyLaundering", claim: "true" },
] as const;

for (const verdict of verdicts) {
  const issued = await kyc.system.identity.claim.issue(
    {
      body: {
        targetIdentityAddress: created.data.identity,
        claim: { topic: verdict.topic, data: { claim: verdict.claim } },
      },
    },
    { context: { idempotencyKey: `pof-claim-${verdict.topic}-${email}` } },
  );
  await settle(kyc, issued, `claim ${verdict.topic}`);
}

const history: ClaimEvents = await kyc.system.identity.claim.history({
  params: { identityAddress: created.data.identity },
  query: {},
});
console.log(`  claim history: ${history.data.length} event(s)`);
for (const event of history.data) {
  console.log(`    block ${event.blockNumber}  ${event.eventName}  ${event.topic}`);
}

const investor: Party = {
  email,
  userId: created.data.id,
  wallet: created.data.wallet,
  identity: created.data.identity,
};
const others = (readState().investors ?? []).filter((party) => party.email !== email);
writeState({ investors: [...others, investor] });
console.log(
  `\nInvestor onboarded (${others.length + 1} on file). Run flow:03 again with another email, then flow:04.`,
);
