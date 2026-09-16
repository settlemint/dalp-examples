// oxlint-disable no-await-in-loop
/**
 * Flow 8 — Settlement (svc-settlement).
 *
 * The only flow where supply comes into existence. The token is unpaused, the
 * approved allocation is minted, and the transaction record is read back for
 * the audit file. Compliance is enforced by the token itself at this moment: a
 * recipient without the KYC and AML claims makes the mint revert.
 *
 * What makes this safe to re-run is the register, not a local file. The holder
 * balances are read first and only the lines that are short are minted, so a
 * settlement job that died halfway finishes the round instead of doubling it.
 * The idempotency key stays on the write as the backstop for the narrow window
 * between that read and the mint.
 */

import { clientFor, heading } from "./lib/client.ts";
import { heldBy, requireInstrument, requireParty } from "./lib/find.ts";
import { ALLOCATED_UNITS, INVESTOR_EMAILS, SYMBOL } from "./lib/offering.ts";
import { baseUnits, trimZeros } from "./lib/units.ts";
import { settle } from "./lib/wait.ts";

const dalp = clientFor("settlement");
heading("Flow 8 — Settlement", "settlement");

const token = await requireInstrument(dalp, SYMBOL, "flow:04");
const held = await heldBy(dalp, token.address);
console.log(`  token ${token.address}, ${INVESTOR_EMAILS.length} allocation line(s)`);

const outstanding: { wallet: string; units: string }[] = [];
for (const email of INVESTOR_EMAILS) {
  const investor = await requireParty(dalp, email, "flow:03");
  const balance = trimZeros(held.get(investor.wallet.toLowerCase()) ?? "0");
  if (balance === ALLOCATED_UNITS) {
    console.log(`  ${email}: already holds ${balance}, nothing to settle`);
    continue;
  }
  outstanding.push({ wallet: investor.wallet, units: ALLOCATED_UNITS });
}

if (outstanding.length === 0) {
  console.log("\nThe round is fully settled. Run flow:09 next.");
  process.exit(0);
}

// Minting reverts on a paused token, so the pause state decides whether the
// unpause is written at all.
if (token.paused) {
  const unpaused = await dalp.token.unpause(
    { params: { tokenAddress: token.address }, body: {} },
    { context: { idempotencyKey: `pof-unpause-${token.address}` } },
  );
  await settle(dalp, unpaused, "unpause");
} else {
  console.log("  the token is already unpaused");
}

const minted = await dalp.token.mint(
  {
    params: { tokenAddress: token.address },
    body: {
      recipients: outstanding.map((line) => line.wallet),
      amounts: outstanding.map((line) => baseUnits(line.units, token.decimals)),
    },
  },
  { context: { idempotencyKey: `pof-mint-${token.address}-round-1` } },
);
const mintTransaction = await settle(dalp, minted, `mint ${outstanding.length} line(s)`);
if (mintTransaction === undefined) {
  throw new Error("The mint answered inline, so there is no transaction record to read back.");
}

const record = await dalp.transaction.status({ params: { transactionId: mintTransaction } });
console.log(`  transaction ${record.data.transactionId}`);
console.log(`    status ${record.data.status}`);
console.log(`    block  ${record.data.blockNumber ?? "none"}`);
console.log(`    hash   ${record.data.transactionHash ?? "none"}`);

const after = await requireInstrument(dalp, SYMBOL, "flow:04");
console.log(`  total supply ${trimZeros(after.totalSupply)}`);

console.log("\nSupply is issued and the investors hold it. Run flow:09 next.");
