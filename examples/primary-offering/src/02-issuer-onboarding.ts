/**
 * Flow 2 — Issuer onboarding (svc-operator).
 *
 * The issuer needs a platform user, a wallet and a registered identity before
 * it can list anything. `user.create` does most of it in one call: account,
 * membership, wallet, identity, and a pending entry in the system's identity
 * registry.
 *
 * Both writes are guarded by a read, so the flow can be run again on an issuer
 * that is already half onboarded. `user.create` is unique on email and answers
 * 409 for an address it knows, so the user is looked up first; and the registry
 * entry is read before it is written, because registering a wallet the registry
 * already carries reverts on chain.
 */

import { clientFor, heading } from "./lib/client.ts";
import { findParty, identityOf } from "./lib/find.ts";
import { COUNTRY, ISSUER_EMAIL } from "./lib/offering.ts";
import { settle } from "./lib/wait.ts";

const dalp = clientFor("operator");
heading("Flow 2 — Issuer onboarding", "operator");

const existing = await findParty(dalp, ISSUER_EMAIL);
let wallet = existing?.wallet;
if (existing === undefined) {
  const created = await dalp.user.create(
    { body: { email: ISSUER_EMAIL, name: "Primary Offering Issuer" } },
    { context: { idempotencyKey: `pof-user-${ISSUER_EMAIL}` } },
  );
  wallet = created.data.wallet;
  console.log(`  user     ${created.data.id} (created)`);
} else {
  console.log(`  user     ${existing.userId} (already on file)`);
}
if (wallet === undefined) {
  throw new Error("The issuer has no wallet.");
}
console.log(`  wallet   ${wallet}`);

// `user.create` already deploys the identity contract and queues it for the
// registry, so the status here is PENDING, not NOT_REGISTERED. Registering is
// what writes the country into the registry and moves it to ACTIVE; nothing
// downstream — no claim, no transfer, no mint — counts until it is ACTIVE.
const identity = await identityOf(dalp, wallet);
console.log(`  identity ${identity.address} (${identity.status})`);
if (identity.status !== "ACTIVE") {
  const registration = await dalp.system.identity.register(
    { body: { wallet, country: COUNTRY } },
    { context: { idempotencyKey: `pof-register-${ISSUER_EMAIL}` } },
  );
  await settle(dalp, registration, "identity registration");
}

console.log("\nIssuer onboarded. Run flow:03 next.");
