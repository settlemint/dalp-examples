/**
 * Flow 7 — Pre-settlement re-check (read-only, svc-reporting).
 *
 * Who gets how much is your decision, taken in your own allocation engine and
 * approved by your own officer; DALP is never asked to make it. It is asked one
 * question, once per approved line, immediately before settlement: would this
 * exact delivery clear? Eligibility can lapse between the order and the mint,
 * and a line that fails here is cheaper than a reverted settlement.
 *
 * The approved allocation is represented here by a hard-coded size per
 * investor, and it is written to state.json for flow 8 to mint.
 */

import { clientFor, heading } from "./lib/client.ts";
import { hasTransferSimulate, skipUnless32 } from "./lib/platform.ts";
import type { TransferSimulation } from "./lib/responses.ts";
import { requireState, writeState } from "./lib/state.ts";
import type { Allocation } from "./lib/state.ts";
import { baseUnits } from "./lib/units.ts";

/** The units your allocation engine approved for each investor. */
const ALLOCATED_UNITS = "1000";

/** A settlement mint has no sender; the chain evaluates it from the zero address. */
const MINT_SENDER = "0x0000000000000000000000000000000000000000";

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

if (!hasTransferSimulate()) {
  skipUnless32("Flow 7");
  console.log("  The allocation is written to state.json all the same, so flow:08 can settle it.");
} else {
  for (const allocation of allocations) {
    const simulation: TransferSimulation = await dalp.token.transferSimulate({
      params: { tokenAddress: token.address },
      query: {
        from: MINT_SENDER,
        to: allocation.wallet,
        amount: baseUnits(allocation.units, token.decimals),
      },
    });
    const blockers = simulation.data.blockers.map((blocker) => blocker.code).join(", ");
    console.log(
      `  ${allocation.wallet}  ${allocation.units} units  ${simulation.data.verdict}  ${blockers}`.trimEnd(),
    );
  }
}

console.log("\nSubmit only the lines that came back will-clear. Run flow:08 next.");
