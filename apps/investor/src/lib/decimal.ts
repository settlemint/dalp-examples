/**
 * Decimal handling for token amounts — `dnum`-free.
 *
 * DALP carries token amounts as locale-independent decimal STRINGS on the wire
 * (the SDK's `bigDecimalSerializer` — see SKILL.md "Serializers"). Token
 * balances and transfer amounts are exact base-10 quantities with a known
 * number of `decimals`, so we never touch JS `number` (float imprecision).
 * Everything here is `bigint` + `string` and is exact.
 *
 * The investor app only needs three things:
 *   - parse a user-typed decimal amount into the smallest-unit `bigint` the
 *     transfer endpoint expects (e.g. "1.5" @ 6 decimals → 1500000n),
 *   - format a wire decimal string for display (thousands grouping, trimmed),
 *   - compare two amounts (does my balance cover this transfer?).
 *
 * `@settlemint/dalp-sdk` ships `dnum` for this, but `dnum` is a transitive dep
 * of the SDK and not directly resolvable from the app's module graph, so we
 * keep a tiny, exact, dependency-free implementation here.
 */

/** A parsed amount: the raw smallest-unit integer plus its decimal precision. */
export interface ParsedAmount {
  /** Smallest-unit value, e.g. 1500000n for "1.5" at 6 decimals. */
  base: bigint;
  /** The token's decimals. */
  decimals: number;
}

export type ParseResult = { ok: true; value: ParsedAmount } | { ok: false; error: string };

/**
 * Parse a human-typed amount (e.g. "1,234.50") against a token's decimals into
 * its smallest-unit `bigint`. Rejects empty, non-numeric, negative, zero, and
 * over-precise inputs (more fraction digits than the token supports) with a
 * clear, user-facing message.
 */
export function parseAmount(input: string, decimals: number): ParseResult {
  const trimmed = input.trim().replace(/,/g, "");
  if (trimmed.length === 0) {
    return { ok: false, error: "Enter an amount." };
  }
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") {
    return { ok: false, error: "Enter a valid number." };
  }

  const [wholePart = "", fractionPart = ""] = trimmed.split(".");
  if (fractionPart.length > decimals) {
    return {
      ok: false,
      error:
        decimals === 0
          ? "This asset doesn't support fractional amounts."
          : `This asset supports at most ${decimals} decimal places.`,
    };
  }

  const paddedFraction = fractionPart.padEnd(decimals, "0");
  const digits = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, "");
  const base = digits.length > 0 ? BigInt(digits) : 0n;

  if (base === 0n) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  return { ok: true, value: { base, decimals } };
}

/**
 * Convert a parsed amount back to the plain decimal string the transfer
 * endpoint expects in the `amount` field (e.g. "1.5"). No grouping — this is a
 * wire value, not display text.
 */
export function toWireAmount({ base, decimals }: ParsedAmount): string {
  return formatBase(base, decimals, { grouping: false, trimZeros: true });
}

/**
 * Format a wire decimal string (or smallest-unit value) for display. Accepts
 * the string DALP returns for balances (already in human units like "1500.0")
 * and re-renders it with thousands grouping and trimmed trailing zeros.
 */
export function formatDecimalString(
  value: string | null | undefined,
  options: { maxFractionDigits?: number } = {},
): string {
  if (value === null || value === undefined || value.trim().length === 0) {
    return "0";
  }
  const negative = value.trim().startsWith("-");
  const unsigned = negative ? value.trim().slice(1) : value.trim();
  const [wholePart = "0", fractionPart = ""] = unsigned.split(".");

  const maxDigits = options.maxFractionDigits;
  const fraction = maxDigits !== undefined ? fractionPart.slice(0, maxDigits) : fractionPart;

  const grouped = groupThousands(wholePart.replace(/^0+(?=\d)/, "") || "0");
  const trimmedFraction = fraction.replace(/0+$/, "");
  const body = trimmedFraction.length > 0 ? `${grouped}.${trimmedFraction}` : grouped;
  return negative ? `-${body}` : body;
}

/** True when `a` (a parsed transfer amount) exceeds the available balance. */
export function exceedsBalance(amount: ParsedAmount, availableBase: bigint): boolean {
  return amount.base > availableBase;
}

/**
 * Convert a human-units decimal string (what `user.assets` / `token.holder`
 * return for a balance) into its smallest-unit `bigint`, so it can be compared
 * against a parsed transfer amount. Returns 0n for empty/invalid input.
 */
export function baseFromDecimalString(value: string | null | undefined, decimals: number): bigint {
  if (value === null || value === undefined) {
    return 0n;
  }
  const result = parseAmount(value, decimals);
  if (result.ok) {
    return result.value.base;
  }
  // The wire value may legitimately be "0" — parseAmount rejects zero, so fall
  // back to a direct, lenient conversion that allows zero.
  const trimmed = value.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(trimmed)) {
    return 0n;
  }
  const [wholePart = "", fractionPart = ""] = trimmed.split(".");
  const padded = fractionPart.slice(0, decimals).padEnd(decimals, "0");
  const digits = `${wholePart}${padded}`.replace(/^0+(?=\d)/, "");
  return digits.length > 0 ? BigInt(digits) : 0n;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function formatBase(
  base: bigint,
  decimals: number,
  options: { grouping: boolean; trimZeros: boolean },
): string {
  const digits = base.toString().padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  const wholePart = digits.slice(0, cut);
  let fractionPart = digits.slice(cut);
  if (options.trimZeros) {
    fractionPart = fractionPart.replace(/0+$/, "");
  }
  const whole = options.grouping ? groupThousands(wholePart) : wholePart;
  return fractionPart.length > 0 ? `${whole}.${fractionPart}` : whole;
}

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
