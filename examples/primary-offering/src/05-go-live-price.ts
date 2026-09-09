/**
 * Flow 5 — Go live and set the price (svc-issuer).
 *
 * Going live at a published moment is your scheduler's job, not the platform's:
 * your cron fires at the offering's open and calls this one route. The price it
 * stores is the price every order in flow 6 is quoted against.
 */

import { clientFor, heading } from "./lib/client.ts";
import type { TokenPrice } from "./lib/responses.ts";
import { requireState } from "./lib/state.ts";
import { settle } from "./lib/wait.ts";

const PRICE = "100.00";
const CURRENCY = "AED";

const token = requireState("token", "flow:04");
const dalp = clientFor("issuer");
heading("Flow 5 — Go live and set the price", "issuer");
console.log(`  token ${token.address}`);

const priced = await dalp.token.setPrice(
  { params: { tokenAddress: token.address }, body: { price: PRICE, currencyCode: CURRENCY } },
  { context: { idempotencyKey: `pof-price-${token.address}-${PRICE}-${CURRENCY}` } },
);
await settle(dalp, priced, `price ${PRICE} ${CURRENCY}`);

const stored: TokenPrice = await dalp.token.price({
  params: { tokenAddress: token.address },
  query: { currency: CURRENCY },
});
console.log(
  `  stored price: ${stored.data.price} ${stored.data.currency} (source: ${stored.data.source})`,
);

console.log("\nThe offering is priced and open. Run flow:06 next.");
