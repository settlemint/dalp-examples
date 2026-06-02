/** Truncate an Ethereum address for display: 0x71C7…976F. */
export function shortWallet(wallet: string | null | undefined): string {
  if (!wallet) {
    return "—";
  }
  if (wallet.length <= 12) {
    return wallet;
  }
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

/** A coarse, locale-stable "time ago" for ISO timestamps. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return "—";
  }
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 30) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  return formatDate(iso);
}

/** Absolute date for a timestamp or ISO date string. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return iso;
  }
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a raw on-chain integer amount (a base-unit string) for display, given
 * the token's decimals. Falls back to the raw string when it isn't a clean
 * integer. Group-separates the whole part and trims trailing fractional zeros.
 */
export function formatTokenAmount(raw: string | null | undefined, decimals: number): string {
  if (raw === null || raw === undefined || raw === "") {
    return "—";
  }
  const negative = raw.startsWith("-");
  const digits = (negative ? raw.slice(1) : raw).replace(/^0+(?=\d)/, "");
  if (!/^\d+$/.test(digits)) {
    return raw;
  }
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals) || "0";
  const fraction = decimals > 0 ? padded.slice(padded.length - decimals) : "";
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmedFraction = fraction.replace(/0+$/, "");
  const sign = negative ? "-" : "";
  return trimmedFraction.length > 0
    ? `${sign}${groupedWhole}.${trimmedFraction}`
    : `${sign}${groupedWhole}`;
}

/** Title-case a snake_case enum value, e.g. "non_resident" → "Non resident". */
export function humanize(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
