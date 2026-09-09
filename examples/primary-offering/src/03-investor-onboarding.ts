/**
 * Flow 3 — Investor onboarding (svc-operator, then svc-kyc).
 *
 * Flow 2 again, plus the step that matters: the compliance verdict is signed
 * onto the identity as an on-chain claim by the KYC service account. From that
 * moment the investor exists on chain and can receive an allocation. The case
 * file never leaves your side; only the verdict reaches the chain.
 *
 * Run it twice with different emails so flow 8 has two recipients:
 *   bun run flow:03 alice@primary-offering.example
 *   bun run flow:03 bob@primary-offering.example
 */

import { clientFor, heading } from "./lib/client.ts";
import type { ClaimEvents, CreatedUser, RegistrationStatus } from "./lib/responses.ts";
import { readState, writeState } from "./lib/state.ts";
import type { Party } from "./lib/state.ts";
import { settle } from "./lib/wait.ts";

const COUNTRY = "AE";

/** The two verdicts the token's compliance rule will require at mint time. */
const VERDICTS = [
  { topic: "knowYourCustomer", claim: "KYC verified" },
  { topic: "antiMoneyLaundering", claim: "AML screening passed" },
] as const;

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

const registration = await operator.system.identity.register(
  { body: { wallet: created.data.wallet, country: COUNTRY } },
  { context: { idempotencyKey: `pof-register-${email}` } },
);
await settle(operator, registration, "identity registration");

const status: RegistrationStatus = await operator.system.identity.registrationStatus({
  query: { wallet: created.data.wallet },
});
console.log(`  registration status: ${status.data.status}`);

for (const verdict of VERDICTS) {
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
