/**
 * Flow 8 — Settlement (svc-settlement).
 *
 * The only flow where supply comes into existence. The token is unpaused, the
 * approved allocation is minted in one call, and the transaction record is read
 * back for the audit file. Compliance is enforced by the token itself at this
 * moment: a recipient without the KYC and AML claims makes the mint revert.
 *
 * The same call is then made a second time with the same idempotency key. It
 * answers with the first mint's result and mints nothing further, which is what
 * makes a settlement job safe to re-run after a timeout.
 */

import { clientFor, heading } from "./lib/client.ts";
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
  throw new Error(
    `This round already settled under ${mintKey}, so the platform answered with its ` +
      "stored result instead of a new handle. Create another offering with flow:04 to settle again.",
  );
}

const record = await dalp.transaction.status({
  params: { transactionId: mintTransaction },
});
console.log(`  transaction ${record.data.transactionId}`);
console.log(`    status ${record.data.status}`);
console.log(`    block  ${record.data.blockNumber ?? "none"}`);
console.log(`    hash   ${record.data.transactionHash ?? "none"}`);

// The replay does not queue a second mint and it does not hand back a second
// handle either: the key already has a settled result, so the platform answers
// with that result, carrying the hash of the transaction that produced it.
const replayed = await dalp.token.mint(mintRequest, {
  context: { idempotencyKey: mintKey },
});
if (!("meta" in replayed)) {
  throw new Error(
    `The replay under ${mintKey} queued a second mint instead of replaying the first.`,
  );
}
const replayedHash = replayed.meta.txHashes[0];
console.log(
  replayedHash === record.data.transactionHash
    ? "  the replay answered with the first mint's transaction hash; nothing minted twice"
    : `  the replay answered with ${String(replayedHash)}, not the first mint's hash`,
);
console.log(`  total supply ${replayed.data.totalSupply}`);

writeState({ mint: { transactionId: mintTransaction, blockNumber: record.data.blockNumber } });
console.log("\nSupply is issued and the investors hold it. Run flow:09 next.");
