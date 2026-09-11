/**
 * Flow 1 — Bootstrap check (read-only, svc-reporting).
 *
 * The platform itself is set up once in the Console, not by an integration.
 * This script only proves the two things every later flow depends on: the KYC
 * and AML claim topics exist, and a trusted issuer is registered for both.
 * Without that registration claims are still recorded and still count for
 * nothing, and every mint in flow 8 reverts.
 */

import { clientFor, heading } from "./lib/client.ts";

/** The two topics the offering's compliance rule will require. */
const REQUIRED = ["knowYourCustomer", "antiMoneyLaundering"];

/** Registries name a topic either "knowYourCustomer" or "Know Your Customer". */
const key = (name: string): string => name.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");

const dalp = clientFor("reporting");
heading("Flow 1 — Bootstrap check", "reporting");

const schemes = await dalp.system.claimTopics.list({ query: {} });
const issuers = await dalp.system.trustedIssuers.list({ query: {} });

let ready = true;
for (const topic of REQUIRED) {
  const scheme = schemes.data.find((row) => key(row.name) === key(topic));
  if (scheme === undefined) {
    console.log(`  [--] claim topic ${topic}: not registered on this platform`);
    ready = false;
    continue;
  }
  console.log(`  [ok] claim topic ${topic}: topicId ${scheme.topicId}`);

  const issuer = issuers.data.find((row) =>
    row.claimTopics.some((claim) => claim.topicId === scheme.topicId),
  );
  if (issuer === undefined) {
    console.log(
      `  [--] trusted issuer for ${topic}: none, so a claim on it would count for nothing`,
    );
    ready = false;
    continue;
  }
  console.log(`  [ok] trusted issuer for ${topic}: ${issuer.id}`);
}

console.log(
  `\n  ${schemes.data.length} topic schemes, ${issuers.data.length} trusted issuers on this platform`,
);
if (!ready) {
  console.error(
    "\nSandbox is not ready. Register the missing topic or trusted issuer in the Console, then run again.",
  );
  process.exit(1);
}
console.log("\nSandbox is ready. Run flow:02 next.");
