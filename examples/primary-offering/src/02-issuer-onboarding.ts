/**
 * Flow 2 — Issuer onboarding (svc-operator).
 *
 * The issuer needs a platform user, a wallet and a registered identity before
 * it can list anything. Three calls do all of it: one creates the account,
 * membership, wallet and identity together; one registers that identity in the
 * system's registry under its country; one confirms the registration landed.
 *
 * Run: bun run flow:02 [email]
 */

import { clientFor, heading } from "./lib/client.ts";
import type { CreatedUser, RegistrationStatus } from "./lib/responses.ts";
import { writeState } from "./lib/state.ts";
import { settle } from "./lib/wait.ts";

/** ISO 3166-1 alpha-2, the jurisdiction the identity is registered under. */
const COUNTRY = "AE";

const email = process.argv[2] ?? "issuer@primary-offering.example";
const dalp = clientFor("operator");
heading("Flow 2 — Issuer onboarding", "operator");

const created: CreatedUser = await dalp.user.create(
  { body: { email, name: "Primary Offering Issuer" } },
  { context: { idempotencyKey: `pof-user-${email}` } },
);
console.log(`  user     ${created.data.id}`);
console.log(`  wallet   ${created.data.wallet}`);
console.log(`  identity ${created.data.identity}`);

const registration = await dalp.system.identity.register(
  { body: { wallet: created.data.wallet, country: COUNTRY } },
  { context: { idempotencyKey: `pof-register-${email}` } },
);
await settle(dalp, registration, "identity registration");

const status: RegistrationStatus = await dalp.system.identity.registrationStatus({
  query: { wallet: created.data.wallet },
});
console.log(`  registration status: ${status.data.status}`);

writeState({
  issuer: {
    email,
    userId: created.data.id,
    wallet: created.data.wallet,
    identity: created.data.identity,
  },
});
console.log("\nIssuer onboarded. Run flow:03 next.");
