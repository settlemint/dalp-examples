/**
 * Flow 8 — Settlement (svc-settlement).
 *
 * The only flow where supply comes into existence. The token is unpaused, the
 * approved allocation is minted in one call, and the transaction record is read
 * back for the audit file. Compliance is enforced by the token itself at this
 * moment: a recipient without the KYC and AML claims makes the mint revert.
 *
 * The same call is then made a second time with the same idempotency key. It
 * returns the first transaction id and mints nothing further, which is what
 * makes a settlement job safe to re-run after a timeout.
 */

import { clientFor, heading } from "./lib/client.ts";
import type { TransactionStatus } from "./lib/responses.ts";
import { requireState, writeState } from "./lib/state.ts";
import { baseUnits } from "./lib/units.ts";
import { settle } from "./lib/wait.ts";

const token = requireState("token", "flow:04");
const allocations = requireState("allocations", "flow:07");
const dalp = clientFor("settlement");
heading("Flow 8 — Settlement", "settlement");
console.log(`  token ${token.address}, ${allocations.length} allocation line(s)`);

const unpaused = await dalp.token.unpause(
  { params: { tokenAddress: token.address }, body: {} },
  { context: { idempotencyKey: `pof-unpause-${token.address}` } },
);
await settle(dalp, unpaused, "unpause");

const mintRequest = {
  params: { tokenAddress: token.address },
  body: {
    recipients: allocations.map((allocation) => allocation.wallet),
    amounts: allocations.map((allocation) => baseUnits(allocation.units, token.decimals)),
  },
};
/** One key for the whole settlement run: the same allocation must mint once. */
const mintKey = `pof-mint-${token.address}-round-1`;

const minted = await dalp.token.mint(mintRequest, { context: { idempotencyKey: mintKey } });
const mintTransaction = await settle(dalp, minted, "mint");
if (mintTransaction === undefined) {
  throw new Error("The mint answered inline; this example expects the queued path.");
}

const record: TransactionStatus = await dalp.transaction.status({
  params: { transactionId: mintTransaction },
});
console.log(`  transaction ${record.data.transactionId}`);
console.log(`    status ${record.data.status}`);
console.log(`    block  ${record.data.blockNumber ?? "none"}`);
console.log(`    hash   ${record.data.transactionHash ?? "none"}`);

const replayed = await dalp.token.mint(mintRequest, { context: { idempotencyKey: mintKey } });
const replayedTransaction = await settle(dalp, replayed, "mint replayed with the same key");
console.log(
  replayedTransaction === mintTransaction
    ? "  the replay returned the first transaction id; no second mint happened"
    : `  the replay returned ${String(replayedTransaction)}, not the first transaction id`,
);

writeState({ mint: { transactionId: mintTransaction, blockNumber: record.data.blockNumber } });
console.log("\nSupply is issued and the investors hold it. Run flow:09 next.");
