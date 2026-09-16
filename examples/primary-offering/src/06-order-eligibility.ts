// oxlint-disable no-await-in-loop
/**
 * Flow 6 — Order-time eligibility (read-only, svc-reporting).
 *
 * Two reads, two different questions, and they are not interchangeable.
 *
 * recipient-eligibility is the cheap pre-filter: it answers only whether the
 * address is present in this token's identity registry, active and not lost. It
 * is not a transfer verdict and must not be read as one; use it to grey out a
 * picker, never to accept an order.
 *
 * transfer-simulate is the authoritative check. It dry-runs the exact delivery
 * that settlement will make and answers will-clear or will-revert, with the
 * blockers and who can clear each one. It arrived with DALP 3.2, and the
 * pinned SDK is on the 3.1 line, so the call is written out below rather than
 * made. Until then, accept an order on the pre-filter and let flow 8 be the
 * place compliance is enforced.
 */

import { clientFor, heading } from "./lib/client.ts";
import { requireInstrument, requireParty } from "./lib/find.ts";
import { ALLOCATED_UNITS, INVESTOR_EMAILS, SYMBOL } from "./lib/offering.ts";

const dalp = clientFor("reporting");
heading("Flow 6 — Order-time eligibility", "reporting");

const token = await requireInstrument(dalp, SYMBOL, "flow:04");
console.log(`  token ${token.address}, order size ${ALLOCATED_UNITS} units`);

for (const email of INVESTOR_EMAILS) {
  const investor = await requireParty(dalp, email, "flow:03");
  const eligibility = await dalp.token.recipientEligibility({
    params: { tokenAddress: token.address },
    query: { address: investor.wallet, action: "mint" },
  });
  const verdict = eligibility.data.eligible ? "in the registry" : "not in the registry";
  console.log(`  ${email.padEnd(40)}${verdict}`);
}

// On a 3.2 platform, with the @settlemint/dalp-sdk pin moved to the 3.2 line,
// this is the read that decides whether the order is accepted. A settlement
// mint has no sender, so the chain evaluates it from the zero address:
//
//   const simulation = await dalp.token.transferSimulate({
//     params: { tokenAddress: token.address },
//     query: {
//       from: "0x0000000000000000000000000000000000000000",
//       to: investor.wallet,
//       amount: baseUnits(ALLOCATED_UNITS, token.decimals),
//     },
//   });
//   console.log(simulation.data.verdict); // will-clear or will-revert
//   for (const blocker of simulation.data.blockers) {
//     console.log(blocker.code, blocker.party, blocker.remediationClass);
//   }

console.log(
  "\n  The transfer verdict needs DALP 3.2; this platform line answers the pre-filter only.",
);
console.log("\nAccept an order only on a will-clear verdict. Run flow:07 next.");
