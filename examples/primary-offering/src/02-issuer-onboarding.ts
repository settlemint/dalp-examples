/**
 * Flow 2 — Issuer onboarding (svc-operator).
 *
 * The issuer needs a platform user, a wallet and a registered identity before
 * it can list anything. `user.create` does most of it in one call: account,
 * membership, wallet, identity, and a pending entry in the system's identity
 * registry. The registration route is for the other case, a wallet that arrived
 * from outside the platform and whose identity the registry has never seen; it
 * reverts on chain for a wallet the platform just registered. So the status is
 * read first, and the registration is made only when the registry has no entry.
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

const registered: RegistrationStatus = await dalp.system.identity.registrationStatus({
  query: { wallet: created.data.wallet },
});
console.log(`  registration: ${registered.data.status}`);
// `user.create` already deploys the identity contract and queues it for the
// registry, so the status here is PENDING, not NOT_REGISTERED. Registering is
// what writes the country into the registry and moves it to ACTIVE; nothing
// downstream — no claim, no transfer, no mint — counts until it is ACTIVE.
if (registered.data.status !== "ACTIVE") {
  const registration = await dalp.system.identity.register(
    { body: { wallet: created.data.wallet, country: COUNTRY } },
    { context: { idempotencyKey: `pof-register-${email}` } },
  );
  await settle(dalp, registration, "identity registration");
}

writeState({
  issuer: {
    email,
    userId: created.data.id,
    wallet: created.data.wallet,
    identity: created.data.identity,
  },
});
console.log("\nIssuer onboarded. Run flow:03 next.");
