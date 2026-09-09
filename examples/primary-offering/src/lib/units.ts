/**
 * Display units to base units.
 *
 * Every amount on the wire — a mint amount, a supply cap, a simulated transfer
 * — is an integer decimal string in the token's base units, the same convention
 * as the contract itself. A person says "1000 shares"; the API is told
 * "1000000000000000000000" for an 18-decimal token. Doing this conversion in
 * one place is what keeps a factor of 10^18 out of the flows.
 */

export function baseUnits(displayUnits: string, decimals: number): string {
  const [whole = "0", fraction = ""] = displayUnits.split(".");
  if (fraction.length > decimals) {
    throw new Error(`${displayUnits} has more than ${decimals} decimal places.`);
  }
  const digits = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/u, "");
  if (!/^\d+$/u.test(digits)) {
    throw new Error(`${displayUnits} is not a positive decimal amount.`);
  }
  return digits;
}
