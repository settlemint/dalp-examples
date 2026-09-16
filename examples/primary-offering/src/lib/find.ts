/**
 * What the platform already knows, read back through its own routes.
 *
 * No flow here keeps a scratch file of ids. Each one asks the platform what
 * exists before it writes: is this user on file, is this identity in the
 * registry, does this symbol already have a token, does this holder already
 * hold its allocation. That is what makes a flow safe to re-run, and it is the
 * same question your own backend has to answer after a crash.
 */

import type { DalpClient } from "@settlemint/dalp-sdk";

/** A party as the platform holds it. */
export interface Party {
  readonly email: string;
  readonly userId: string;
  readonly wallet: string;
}

/** The instrument as the platform holds it. */
export interface Instrument {
  readonly address: string;
  readonly decimals: number;
  readonly paused: boolean;
  readonly totalSupply: string;
  /** The stored base price in display units, "0" while the token has no feed. */
  readonly basePrice: string;
  readonly priceCurrency: string | null;
}

/** Registries name a topic either "knowYourCustomer" or "Know Your Customer". */
export function topicKey(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
}

/**
 * The user behind one email address, or `undefined` if nobody has been created.
 *
 * The address the flows sign and mint to is `signingAddress`. A list row's
 * `wallet` is the account's smart wallet, which stays null while it is
 * counterfactual, so reading that field instead would lose every investor.
 */
export async function findParty(dalp: DalpClient, email: string): Promise<Party | undefined> {
  const users = await dalp.user.list({ query: { filter: { email } } });
  const row = users.data.find((user) => user.email === email);
  if (row === undefined) {
    return undefined;
  }
  const wallet = row.signingAddress;
  if (wallet === null || wallet === undefined) {
    throw new Error(`${email} exists but has no signing address yet.`);
  }
  return { email, userId: row.id, wallet };
}

/** The same, for a flow that cannot do its work without the party. */
export async function requireParty(
  dalp: DalpClient,
  email: string,
  producedBy: string,
): Promise<Party> {
  const party = await findParty(dalp, email);
  if (party === undefined) {
    throw new Error(`The platform has no user for ${email}. Run ${producedBy} first.`);
  }
  return party;
}

/** The token listed under one symbol, or `undefined` if it has not been created. */
export async function findInstrument(
  dalp: DalpClient,
  symbol: string,
): Promise<Instrument | undefined> {
  const tokens = await dalp.token.list({ query: { filter: { symbol } } });
  const row = tokens.data.find((token) => token.symbol === symbol);
  if (row === undefined) {
    return undefined;
  }
  return {
    address: row.id,
    decimals: Number(row.decimals),
    paused: row.pausable?.paused ?? false,
    totalSupply: String(row.totalSupply),
    basePrice: String(row.basePrice),
    priceCurrency: row.basePriceCurrencyCode ?? null,
  };
}

/** The same, for a flow that cannot do its work without the token. */
export async function requireInstrument(
  dalp: DalpClient,
  symbol: string,
  producedBy: string,
): Promise<Instrument> {
  const instrument = await findInstrument(dalp, symbol);
  if (instrument === undefined) {
    throw new Error(`No token is listed under ${symbol}. Run ${producedBy} first.`);
  }
  return instrument;
}

/** The on-chain identity behind a wallet, and whether the registry carries it. */
export async function identityOf(
  dalp: DalpClient,
  wallet: string,
): Promise<{ readonly status: string; readonly address: string }> {
  const status = await dalp.system.identity.registrationStatus({ query: { wallet } });
  const address = status.data.identityAddress;
  if (address === undefined) {
    throw new Error(`No identity contract has been deployed for .`);
  }
  return { status: status.data.status, address };
}

/** The numeric topic id one claim topic is registered under on this platform. */
export async function topicIdFor(dalp: DalpClient, name: string): Promise<string> {
  const schemes = await dalp.system.claimTopics.list({ query: {} });
  const scheme = schemes.data.find((row) => topicKey(row.name) === topicKey(name));
  if (scheme === undefined) {
    throw new Error(`Claim topic ${name} is not registered on this platform. Run flow:01.`);
  }
  return scheme.topicId;
}

/** The topic ids an identity already carries a claim for. */
export async function claimedTopicIds(
  dalp: DalpClient,
  identityAddress: string,
): Promise<ReadonlySet<string>> {
  const history = await dalp.system.identity.claim.history({
    params: { identityAddress },
    query: {},
  });
  return new Set(
    history.data.filter((event) => event.eventName === "ClaimAdded").map((event) => event.topic),
  );
}

/**
 * What each address holds of one token, keyed by lower-case address.
 *
 * Balances come back in display units, not base units: "1000.000000000000000000"
 * for a whole thousand of an 18-decimal token.
 */
export async function heldBy(
  dalp: DalpClient,
  tokenAddress: string,
): Promise<ReadonlyMap<string, string>> {
  const holders = await dalp.token.holders({ params: { tokenAddress }, query: {} });
  return new Map(
    holders.data.map((holder) => [holder.account.id.toLowerCase(), String(holder.value)]),
  );
}
