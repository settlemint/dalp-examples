// oxlint-disable no-await-in-loop
/**
 * Flow 7 — Pre-settlement re-check (read-only, svc-reporting).
 *
 * Who gets how much is your decision, taken in your own allocation engine and
 * approved by your own officer; DALP is never asked to make it, and it is the
 * one thing in these flows that is not read back from the platform. It is asked
 * one question, once per approved line, immediately before settlement: would
 * this exact delivery clear? Eligibility can lapse between the order and the
 * mint, and a line that fails here is cheaper than a reverted settlement.
 *
 * That question is transfer-simulate, which arrived with DALP 3.2. On the 3.1
 * line this flow re-reads the registry pre-filter instead, and reports what each
 * line already holds so a re-run shows how much of the round is left to settle.
 */

import { clientFor, heading } from "./lib/client.ts";
import { heldBy, requireInstrument, requireParty } from "./lib/find.ts";
import { ALLOCATED_UNITS, INVESTOR_EMAILS, SYMBOL } from "./lib/offering.ts";
import { trimZeros } from "./lib/units.ts";

const dalp = clientFor("reporting");
heading("Flow 7 — Pre-settlement re-check", "reporting");

const token = await requireInstrument(dalp, SYMBOL, "flow:04");
const held = await heldBy(dalp, token.address);
console.log(`  approved allocation: ${INVESTOR_EMAILS.length} line(s) of ${ALLOCATED_UNITS} units`);

for (const email of INVESTOR_EMAILS) {
  const investor = await requireParty(dalp, email, "flow:03");
  const eligibility = await dalp.token.recipientEligibility({
    params: { tokenAddress: token.address },
    query: { address: investor.wallet, action: "mint" },
  });
  const verdict = eligibility.data.eligible ? "in the registry" : "not in the registry";
  const balance = trimZeros(held.get(investor.wallet.toLowerCase()) ?? "0");
  console.log(`  ${investor.wallet}  ${ALLOCATED_UNITS} units  ${verdict}  holds ${balance}`);
}

// The 3.2 re-check, per approved line, replacing the pre-filter above:
//
//   const simulation = await dalp.token.transferSimulate({
//     params: { tokenAddress: token.address },
//     query: {
//       from: "0x0000000000000000000000000000000000000000",
//       to: investor.wallet,
//       amount: baseUnits(ALLOCATED_UNITS, token.decimals),
//     },
//   });
//   // Submit the line only on simulation.data.verdict === "will-clear".

console.log(
  "\n  The transfer verdict needs DALP 3.2; this platform line answers the pre-filter only.",
);
console.log("\nSubmit only the lines that came back will-clear. Run flow:08 next.");
