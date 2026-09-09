/**
 * Display units to base units, and back.
 *
 * Every amount on the wire — a mint amount, a supply cap, a simulated transfer
 * — is an integer decimal string in the token's base units, the same convention
 * as the contract itself. A person says "1000 shares"; the API is told
 * "1000000000000000000000" for an 18-decimal token. Doing this conversion in
 * one place is what keeps a factor of 10^18 out of the flows.
 */

export function baseUnits(amount: string, decimals: number): string {
  const [whole = "0", fraction = ""] = amount.split(".");
  if (fraction.length > decimals) {
    throw new Error(`${amount} has more than ${decimals} decimal places.`);
  }
  const digits = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/u, "");
  if (!/^\d+$/u.test(digits)) {
    throw new Error(`${amount} is not a positive decimal amount.`);
  }
  return digits;
}

/** Base units back to a readable decimal string, for printing what came back. */
export function displayUnits(base: string, decimals: number): string {
  const padded = base.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/u, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

/**
 * Trim a decimal string the platform already scaled for display.
 *
 * A balance comes back as "1000.000000000000000000". The zeros are real but
 * they are not information, and a register reads better without them.
 */
export function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/u, "") : value;
}
