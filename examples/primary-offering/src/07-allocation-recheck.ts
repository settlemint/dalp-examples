/**
 * Flow 7 — Pre-settlement re-check (read-only, svc-reporting).
 *
 * Who gets how much is your decision, taken in your own allocation engine and
 * approved by your own officer; DALP is never asked to make it. It is asked one
 * question, once per approved line, immediately before settlement: would this
 * exact delivery clear? Eligibility can lapse between the order and the mint,
 * and a line that fails here is cheaper than a reverted settlement.
 *
 * That question is transfer-simulate, which arrived with DALP 3.2. On the 3.1
 * line this flow re-reads the registry pre-filter instead and writes the
 * approved allocation to state.json for flow 8 to mint.
 *
 * The approved allocation is represented here by a hard-coded size per
 * investor.
 */

import { clientFor, heading } from "./lib/client.ts";
import { requireState, writeState } from "./lib/state.ts";
import type { Allocation } from "./lib/state.ts";

/** The units your allocation engine approved for each investor. */
const ALLOCATED_UNITS = "1000";

const token = requireState("token", "flow:04");
const investors = requireState("investors", "flow:03");
const dalp = clientFor("reporting");
heading("Flow 7 — Pre-settlement re-check", "reporting");

const allocations: readonly Allocation[] = investors.map((investor) => ({
  wallet: investor.wallet,
  units: ALLOCATED_UNITS,
}));
writeState({ allocations });
console.log(`  approved allocation: ${allocations.length} line(s) of ${ALLOCATED_UNITS} units`);

for (const allocation of allocations) {
  const eligibility = await dalp.token.recipientEligibility({
    params: { tokenAddress: token.address },
    query: { address: allocation.wallet, action: "mint" },
  });
  const verdict = eligibility.data.eligible ? "in the registry" : "not in the registry";
  console.log(`  ${allocation.wallet}  ${allocation.units} units  ${verdict}`);
}

// The 3.2 re-check, per approved line, replacing the pre-filter above:
//
//   const simulation = await dalp.token.transferSimulate({
//     params: { tokenAddress: token.address },
//     query: {
//       from: "0x0000000000000000000000000000000000000000",
//       to: allocation.wallet,
//       amount: baseUnits(allocation.units, token.decimals),
//     },
//   });
//   // Submit the line only on simulation.data.verdict === "will-clear".

console.log(
  "\n  The transfer verdict needs DALP 3.2; this platform line answers the pre-filter only.",
);
console.log("\nSubmit only the lines that came back will-clear. Run flow:08 next.");
