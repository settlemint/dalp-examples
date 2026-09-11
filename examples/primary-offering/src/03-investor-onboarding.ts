/**
 * Flow 3 — Investor onboarding (svc-operator, then svc-kyc).
 *
 * Flow 2 again, registry entry and all, plus the two steps that matter, for
 * every investor in the offering.
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
 * Every step is guarded by a read of what the platform already holds, so a
 * second run onboards only what the first one did not finish.
 */

import { clientFor, heading } from "./lib/client.ts";
import { claimedTopicIds, findParty, identityOf, topicIdFor } from "./lib/find.ts";
import { COUNTRY, INVESTOR_EMAILS, REQUIRED_TOPICS } from "./lib/offering.ts";
import { settle } from "./lib/wait.ts";

const operator = clientFor("operator");
const kyc = clientFor("kyc");
heading("Flow 3 — Investor onboarding", "operator");

const topicIds = new Map<string, string>();
for (const topic of REQUIRED_TOPICS) {
  topicIds.set(topic, await topicIdFor(operator, topic));
}

for (const email of INVESTOR_EMAILS) {
  console.log(`\n  ${email}`);

  const existing = await findParty(operator, email);
  let wallet = existing?.wallet;
  let userId = existing?.userId;
  if (existing === undefined) {
    const created = await operator.user.create(
      { body: { email, name: "Primary Offering Investor" } },
      { context: { idempotencyKey: `pof-user-${email}` } },
    );
    wallet = created.data.wallet;
    userId = created.data.id;
    console.log(`    user     ${userId} (created)`);
  } else {
    console.log(`    user     ${userId} (already on file)`);
  }
  if (wallet === undefined || userId === undefined) {
    throw new Error(`${email} has no wallet.`);
  }

  // `user.create` already deploys the identity contract and queues it for the
  // registry, so the status here is PENDING, not NOT_REGISTERED. Registering is
  // what writes the country into the registry and moves it to ACTIVE; nothing
  // downstream — no claim, no transfer, no mint — counts until it is ACTIVE.
  const identity = await identityOf(operator, wallet);
  console.log(`    identity ${identity.address} (${identity.status})`);
  if (identity.status !== "ACTIVE") {
    const registration = await operator.system.identity.register(
      { body: { wallet, country: COUNTRY } },
      { context: { idempotencyKey: `pof-register-${email}` } },
    );
    await settle(operator, registration, "    identity registration");
  }

  // An approved version is unique on national id and country within the
  // organization, so the identifier is derived from the investor's own address.
  const versions = await kyc.user.kyc.versions.list({ params: { userId }, query: {} });
  const approved = versions.data.find((version) => version.status === "approved");
  if (approved === undefined) {
    const draft = await kyc.user.kyc.versions.create({
      params: { userId },
      body: {
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
    await kyc.user.kyc.version.submit({ params: { versionId: draft.data.id } });
    const reviewed = await kyc.user.kyc.version.approve({
      params: { versionId: draft.data.id },
      body: {},
    });
    console.log(`    kyc profile version ${draft.data.versionNumber}: ${reviewed.data.status}`);
  } else {
    console.log(`    kyc profile version ${approved.versionNumber}: already approved`);
  }

  // The claim values are not free text. `knowYourCustomer` carries the content
  // hash of the approved version, which binds the claim on chain to the exact
  // record the reviewer approved; every other investor topic is a boolean
  // auto-claim and takes the literal "true".
  const profile = await kyc.user.kyc.profile.read({ params: { userId } });
  const contentHash = profile.data.approvedVersion?.contentHash;
  if (contentHash === null || contentHash === undefined) {
    throw new Error("The approved KYC version carries no content hash.");
  }

  const alreadyClaimed = await claimedTopicIds(kyc, identity.address);
  for (const topic of REQUIRED_TOPICS) {
    const topicId = topicIds.get(topic);
    if (topicId !== undefined && alreadyClaimed.has(topicId)) {
      console.log(`    claim ${topic}: already on the identity`);
      continue;
    }
    const issued = await kyc.system.identity.claim.issue(
      {
        body: {
          targetIdentityAddress: identity.address,
          claim: {
            topic,
            data: { claim: topic === "knowYourCustomer" ? contentHash : "true" },
          },
        },
      },
      { context: { idempotencyKey: `pof-claim-${topic}-${email}` } },
    );
    await settle(kyc, issued, `    claim ${topic}`);
  }
}

console.log(`\n${INVESTOR_EMAILS.length} investor(s) onboarded. Run flow:04 next.`);
