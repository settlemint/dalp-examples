/**
 * Explicit response shapes for the untyped `dapi.*` surface.
 *
 * Per the SDK ground truth, `dapi.*` resolves to `any` (the oRPC contract isn't
 * resolvable + `skipLibCheck`), so the compiler will NOT catch a wrong method
 * name or a wrong field. We therefore declare every response we consume here,
 * sourced field-by-field from the reference docs:
 *   - user.assets / user.events  → references/user-kyc.md, account-reads.md
 *   - token.list / token.read / token.metadata / token.holder → references/token.md
 *   - contacts.list              → v2 contacts namespace (list/read/upsert/delete)
 *   - transaction.read           → references/account-reads.md
 *
 * Every consumer casts the `any` return to one of these interfaces at the call
 * boundary, so component code never touches raw `any`.
 *
 * This module is client-SAFE (pure types + small pure helpers, no server-only
 * imports), so React components can import the view types directly.
 */

import type { NormalizedDalpError } from "./dalp-errors";

// ===========================================================================
// user.me
// ===========================================================================

export interface UserMeResponse {
  data: {
    id: string;
    email?: string | null;
    name?: string | null;
    wallet?: string | null;
    kycStatus?: string | null;
  } | null;
}

// ===========================================================================
// user.assets — paginated holdings rollup across tokens
//   references/user-kyc.md: balance.token.symbol, balance.balance
// ===========================================================================

export interface AssetTokenRef {
  id?: string | null; // token contract address
  address?: string | null;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  type?: string | null;
}

export interface UserAssetRow {
  token?: AssetTokenRef | null;
  balance?: string | null; // human-units decimal string
  available?: string | null; // balance − frozen
  frozen?: string | null;
}

export interface UserAssetsResponse {
  data: UserAssetRow[] | null;
  meta?: PageMeta | null;
}

// ===========================================================================
// user.events — per-user activity feed
// ===========================================================================

export interface UserEventRow {
  id?: string | null;
  eventType?: string | null; // e.g. "Transfer", "Mint", "ClaimIssued"
  blockTimestamp?: string | null; // ISO-8601
  createdAt?: string | null;
  transactionHash?: string | null;
  token?: AssetTokenRef | null;
  from?: string | null;
  to?: string | null;
  amount?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface UserEventsResponse {
  data: UserEventRow[] | null;
  meta?: PageMeta | null;
}

// ===========================================================================
// token.list — browse compliant tokens
// ===========================================================================

export interface TokenListRow {
  id?: string | null; // contract address
  address?: string | null;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  type?: string | null;
  totalSupply?: string | null;
  pausable?: { paused?: boolean | null } | null;
  paused?: boolean | null;
}

export interface TokenListResponse {
  data: TokenListRow[] | null;
  meta?: PageMeta | null;
}

// ===========================================================================
// token.read + token.metadata
// ===========================================================================

export interface TokenReadResponse {
  data:
    | (TokenListRow & {
        countryCode?: string | null;
        createdAt?: string | null;
        cap?: string | null;
      })
    | null;
}

export interface TokenMetadataResponse {
  data: {
    name?: string | null;
    symbol?: string | null;
    decimals?: number | null;
    description?: string | null;
    isin?: string | null;
    assetClass?: string | null;
    priceCurrency?: string | null;
    basePrice?: string | null;
  } | null;
}

// ===========================================================================
// token.holder — my balance of a specific token
//   references/token.md: holder.account.id, holder.balance, holder.available
// ===========================================================================

export interface TokenHolderResponse {
  data: {
    holder?: {
      account?: { id?: string | null } | null;
      balance?: string | null;
      available?: string | null;
      frozen?: string | null;
    } | null;
  } | null;
}

// ===========================================================================
// contacts.list — transfer-form recipient autocomplete
//
// The v2 `dapi.contacts` namespace exposes ONLY { list, read, upsert, delete }.
// There is NO `contacts.search` on v2 (it was a v1-only route, never wired into
// the dapi client — calling it fails at runtime). We list contacts and filter
// by the typed query client-side.
// ===========================================================================

export interface ContactRow {
  id?: string | null;
  name?: string | null;
  wallet?: string | null;
  note?: string | null;
}

export interface ContactsListResponse {
  data: ContactRow[] | null;
  meta?: PageMeta | null;
}

// ===========================================================================
// token.transfer (async) — returns a transaction id / statusUrl
// ===========================================================================

export interface TransferResponse {
  data: {
    id?: string | null; // transaction id to poll
    transactionId?: string | null;
    statusUrl?: string | null;
  } | null;
}

// ===========================================================================
// transaction.read — poll target
//   references/account-reads.md: status, transactionHash, events
// ===========================================================================

export type TransactionStatus = "pending" | "processing" | "completed" | "failed" | string;

export interface TransactionReadResponse {
  data: {
    id?: string | null;
    status?: TransactionStatus | null;
    transactionHash?: string | null;
    events?: unknown[] | null;
  } | null;
}

// ===========================================================================
// shared
// ===========================================================================

export interface PageMeta {
  totalCount?: number | null;
  offset?: number | null;
  limit?: number | null;
}

// ===========================================================================
// View models — what the routes hand to the components (already normalized,
// never `any`, never nullable where the UI needs a value).
// ===========================================================================

export interface HoldingView {
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  type: string | null;
  /** Human-units balance string for display. */
  balance: string;
  /** Available (balance − frozen), human-units, for transfer caps. */
  available: string;
}

export interface ActivityView {
  id: string;
  eventType: string;
  timestamp: string | null;
  tokenSymbol: string | null;
  counterparty: string | null;
  amount: string | null;
  transactionHash: string | null;
}

export interface TokenView {
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  type: string | null;
  paused: boolean;
}

export interface ContactSuggestion {
  id: string;
  name: string;
  wallet: string;
}

export type LoaderResult<T> =
  | { ok: true; data: T }
  | { ok: false; authed: boolean; error: NormalizedDalpError };

// ---------------------------------------------------------------------------
// Small pure helpers shared across routes (client-safe).
// ---------------------------------------------------------------------------

/** Resolve a token's contract address from either `id` or `address`. */
export function tokenAddressOf(
  token: { id?: string | null; address?: string | null } | null | undefined,
): string | null {
  return token?.id ?? token?.address ?? null;
}

/** A token's paused flag from either the nested `pausable` or flat `paused`. */
export function isPaused(token: TokenListRow): boolean {
  return token.pausable?.paused ?? token.paused ?? false;
}

/** Shorten a 0x address to `0x1234…cdef` for display. */
export function shortenAddress(address: string | null | undefined): string {
  if (!address) {
    return "—";
  }
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const EVENT_LABELS: Record<string, string> = {
  Transfer: "Transfer",
  Mint: "Received (mint)",
  Burn: "Burn",
  Approval: "Approval",
  ClaimIssued: "Identity claim issued",
  ClaimRevoked: "Identity claim revoked",
  Paused: "Asset paused",
  Unpaused: "Asset unpaused",
  AddressFrozen: "Address frozen",
  TokensFrozen: "Tokens frozen",
  TokensUnfrozen: "Tokens unfrozen",
};

/** Human-friendly label for an on-chain event type. */
export function eventLabel(eventType: string | null | undefined): string {
  if (!eventType) {
    return "Activity";
  }
  return EVENT_LABELS[eventType] ?? eventType;
}

const CONTACT_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Recipient-autocomplete filter for the `contacts.list` result. The v2 contacts
 * namespace has no server-side query param, so the listed contacts are matched
 * against the typed query (by name or wallet) client-side, then shaped into the
 * suggestion the autocomplete consumes. Only contacts with a valid 0x wallet
 * are surfaced (the recipient must be a wallet address).
 */
export function filterContacts(
  contacts: readonly ContactRow[],
  query: string,
): ContactSuggestion[] {
  const needle = query.trim().toLowerCase();
  return contacts.flatMap((contact) => {
    if (!contact.wallet || !CONTACT_ADDRESS_RE.test(contact.wallet)) {
      return [];
    }
    const name = contact.name ?? "";
    const matches =
      needle.length === 0 ||
      name.toLowerCase().includes(needle) ||
      contact.wallet.toLowerCase().includes(needle);
    if (!matches) {
      return [];
    }
    return [
      {
        id: contact.id ?? contact.wallet,
        name: name || "Saved contact",
        wallet: contact.wallet,
      },
    ];
  });
}
