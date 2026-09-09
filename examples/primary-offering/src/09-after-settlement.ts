/**
 * Flow 9 — After settlement (svc-reporting, one write from svc-settlement).
 *
 * The register is the platform's, not a spreadsheet's. Three reads answer the
 * three questions asked after an offering closes: what does the platform show
 * this account, who holds what now, and what did each holder hold at the block
 * the mint settled in. The last read is the one an auditor asks for, because it
 * is a statement about a block and not about now.
 *
 * The one write pauses the token again, which is where a primary offering rests
 * until secondary trading is opened deliberately.
 */

import { clientFor, heading } from "./lib/client.ts";
import type { HistoricalBalance, HolderBalance, UserAssets } from "./lib/responses.ts";
import { requireState } from "./lib/state.ts";
import { trimZeros } from "./lib/units.ts";
import { settle } from "./lib/wait.ts";

const token = requireState("token", "flow:04");
const investors = requireState("investors", "flow:03");
const mint = requireState("mint", "flow:08");
const dalp = clientFor("reporting");
heading("Flow 9 — After settlement", "reporting");

const portfolio: UserAssets = await dalp.user.assets({ query: {} });
console.log(`  the reporting account holds ${portfolio.data.length} asset row(s) of its own`);

console.log(`\n  holder register for ${token.address}`);
console.log(
  `  ${"investor".padEnd(34)}${"balance".padEnd(12)}${"frozen".padEnd(12)}at block ${mint.blockNumber ?? "?"}`,
);
for (const investor of investors) {
  const current: HolderBalance = await dalp.token.holder({
    params: { tokenAddress: token.address },
    query: { holderAddress: investor.wallet },
  });
  const atMint: HistoricalBalance = await dalp.token.historicalBalanceAtBlockByHolder({
    params: { tokenAddress: token.address, holderAddress: investor.wallet },
    query: { atBlock: Number(mint.blockNumber) },
  });
  const holder = current.data.holder;
  console.log(
    `  ${investor.email.padEnd(34)}${trimZeros(holder?.value ?? "0").padEnd(12)}` +
      `${trimZeros(holder?.frozen ?? "0").padEnd(12)}${trimZeros(atMint.data.balance)}`,
  );
}

const settlement = clientFor("settlement");
const paused = await settlement.token.pause(
  { params: { tokenAddress: token.address }, body: {} },
  { context: { idempotencyKey: `pof-pause-${token.address}-after-settlement` } },
);
await settle(settlement, paused, "pause after settlement");

console.log("\nThe offering is settled, the register is readable and the token rests paused.");
