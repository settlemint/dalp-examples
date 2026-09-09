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
 * blockers and who can clear each one. It arrived with DALP 3.2.
 */

import { clientFor, heading } from "./lib/client.ts";
import { hasTransferSimulate, skipUnless32 } from "./lib/platform.ts";
import type { RecipientEligibility, TransferSimulation } from "./lib/responses.ts";
import { requireState } from "./lib/state.ts";
import { baseUnits } from "./lib/units.ts";

/** What the investor asked for, in whole display units. */
const ORDER_SIZE = "1000";

/** A settlement mint has no sender; the chain evaluates it from the zero address. */
const MINT_SENDER = "0x0000000000000000000000000000000000000000";

const token = requireState("token", "flow:04");
const investors = requireState("investors", "flow:03");
const dalp = clientFor("reporting");
heading("Flow 6 — Order-time eligibility", "reporting");
console.log(`  token ${token.address}, order size ${ORDER_SIZE} units`);

for (const investor of investors) {
  const eligibility: RecipientEligibility = await dalp.token.recipientEligibility({
    params: { tokenAddress: token.address },
    query: { address: investor.wallet, action: "mint" },
  });
  console.log(`\n  ${investor.email}`);
  console.log(
    `    registry pre-filter: ${eligibility.data.eligible ? "in the registry" : "not in the registry"}`,
  );

  if (!hasTransferSimulate()) {
    console.log("    transfer verdict:    unavailable on this platform line");
    continue;
  }

  const simulation: TransferSimulation = await dalp.token.transferSimulate({
    params: { tokenAddress: token.address },
    query: {
      from: MINT_SENDER,
      to: investor.wallet,
      amount: baseUnits(ORDER_SIZE, token.decimals),
    },
  });
  console.log(`    transfer verdict:    ${simulation.data.verdict}`);
  for (const blocker of simulation.data.blockers) {
    console.log(
      `      blocked on ${blocker.code} (${blocker.party}, cleared by ${blocker.remediationClass})`,
    );
  }
}

if (!hasTransferSimulate()) {
  skipUnless32("The authoritative half of flow 6");
}
console.log("\nAccept an order only on a will-clear verdict. Run flow:07 next.");
