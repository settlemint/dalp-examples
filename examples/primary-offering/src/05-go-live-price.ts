/**
 * Flow 5 — Go live and set the price (svc-issuer).
 *
 * Going live at a published moment is your scheduler's job, not the platform's:
 * your cron fires at the offering's open and calls this one route. The price it
 * stores is the price every order in flow 6 is quoted against.
 *
 * The token carries no base-price feed until this call registers one, and
 * `token.list` reports what is registered. Reading that first is what lets a
 * cron fire twice, or a run resume after a failure, without writing again.
 */

import { clientFor, heading } from "./lib/client.ts";
import { requireInstrument } from "./lib/find.ts";
import { CURRENCY, PRICE, SYMBOL } from "./lib/offering.ts";
import { displayUnits, trimZeros } from "./lib/units.ts";
import { settle } from "./lib/wait.ts";

const dalp = clientFor("issuer");
heading("Flow 5 — Go live and set the price", "issuer");

const token = await requireInstrument(dalp, SYMBOL, "flow:04");
console.log(`  token ${token.address}`);

const priced = token.priceCurrency === CURRENCY && trimZeros(token.basePrice) === trimZeros(PRICE);
if (priced) {
  // Deliberately not `token.price` here. That route reads the feed and refuses
  // an observation older than the PriceResolver policy allows (DALP-0335), so
  // an offering that has been open for days would fail a read that is only
  // meant to confirm the write was not needed. `token.list` reports the
  // registered base price without consulting the feed's freshness.
  console.log(`  price ${trimZeros(token.basePrice)} ${token.priceCurrency} is already registered`);
} else {
  const write = await dalp.token.setPrice(
    { params: { tokenAddress: token.address }, body: { price: PRICE, currencyCode: CURRENCY } },
    { context: { idempotencyKey: `pof-price-${token.address}-${PRICE}-${CURRENCY}` } },
  );
  await settle(dalp, write, `price ${PRICE} ${CURRENCY}`);

  // The price route answers from the feed, as an 18-decimal integer whatever
  // the token's own decimals are, with the precision named alongside it.
  const stored = await dalp.token.price({
    params: { tokenAddress: token.address },
    query: { currency: CURRENCY },
  });
  console.log(
    `  stored price: ${displayUnits(stored.data.price, stored.data.decimals)} ${stored.data.currency} (source: ${stored.data.source})`,
  );
}

console.log("\nThe offering is priced and open. Run flow:06 next.");
