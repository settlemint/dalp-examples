/**
 * Flow 9 — After settlement (svc-reporting, one write from svc-settlement).
 *
 * The register is the platform's, not a spreadsheet's. Four reads answer the
 * questions asked after an offering closes: what does the platform show this
 * account, which block did the mint settle in, who holds what now, and what did
 * each holder hold at that block. The last one is what an auditor asks for,
 * because it is a statement about a block and not about now.
 *
 * The mint block comes from the token's own event log, so the audit read stands
 * on its own: it needs nothing carried over from the run that settled.
 *
 * The one write pauses the token again, which is where a primary offering rests
 * until secondary trading is opened deliberately.
 */

import { clientFor, heading } from "./lib/client.ts";
import { requireInstrument, requireParty } from "./lib/find.ts";
import { INVESTOR_EMAILS, SYMBOL } from "./lib/offering.ts";
import { trimZeros } from "./lib/units.ts";
import { settle } from "./lib/wait.ts";

const dalp = clientFor("reporting");
heading("Flow 9 — After settlement", "reporting");

const token = await requireInstrument(dalp, SYMBOL, "flow:04");

const portfolio = await dalp.user.assets({ query: {} });
console.log(`  the reporting account holds ${portfolio.data.length} asset row(s) of its own`);

const mints = await dalp.token.events({
  params: { tokenAddress: token.address },
  query: { filter: { eventName: "MintCompleted" }, sort: "-blockNumber", page: { limit: 1 } },
});
const mintBlock = mints.data[0]?.blockNumber;
if (mintBlock === undefined) {
  throw new Error(`${SYMBOL} carries no MintCompleted event. Run flow:08 first.`);
}

console.log(`\n  holder register for ${token.address}`);
console.log(
  `  ${"investor".padEnd(34)}${"balance".padEnd(12)}${"frozen".padEnd(12)}at block ${mintBlock}`,
);
for (const email of INVESTOR_EMAILS) {
  const investor = await requireParty(dalp, email, "flow:03");
  const current = await dalp.token.holder({
    params: { tokenAddress: token.address },
    query: { holderAddress: investor.wallet },
  });
  const atMint = await dalp.token.historicalBalanceAtBlockByHolder({
    params: { tokenAddress: token.address, holderAddress: investor.wallet },
    query: { atBlock: String(mintBlock) },
  });
  // Amounts come back as a string or a number depending on the field's width.
  const holder = current.data.holder;
  console.log(
    `  ${email.padEnd(34)}${trimZeros(String(holder?.value ?? 0)).padEnd(12)}` +
      `${trimZeros(String(holder?.frozen ?? 0)).padEnd(12)}${trimZeros(String(atMint.data.balance))}`,
  );
}

const settlement = clientFor("settlement");
if (token.paused) {
  console.log("  the token already rests paused");
} else {
  const paused = await settlement.token.pause(
    { params: { tokenAddress: token.address }, body: {} },
    { context: { idempotencyKey: `pof-pause-${token.address}-after-settlement` } },
  );
  await settle(settlement, paused, "pause after settlement");
}

console.log("\nThe offering is settled, the register is readable and the token rests paused.");
