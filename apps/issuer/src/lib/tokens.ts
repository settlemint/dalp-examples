import { createServerFn } from "@tanstack/react-start";
import { dalpForMutation, normalizeDalpError, type NormalizedDalpError } from "~/lib/dalp";
import { dalpForCurrentRequest, getIncomingCookie } from "~/lib/dalp.server";

/* -------------------------------------------------------------------------- */
/*  Typed boundaries for `dapi.token.*` / `dapi.settings.*` / `dapi.system.*`. */
/*                                                                            */
/*  `dapi.*` resolves to `any` (the oRPC contract isn't type-resolvable +     */
/*  skipLibCheck), so every shape below is annotated explicitly at the wire   */
/*  boundary. Method names + argument shapes are sourced from                 */
/*  references/token.md and references/system-admin.md — never invented.      */
/* -------------------------------------------------------------------------- */

/** Asset types `token.create` accepts (the SMART factory registry types). */
export type TokenType = "bond" | "equity" | "fund" | "stablecoin" | "deposit";

/** Wallet-auth verification payload (DALP `UserVerificationSchema`). */
interface WalletVerification {
  secretVerificationCode: string;
  verificationType: "PINCODE";
}

/* ---- token.create -------------------------------------------------------- */

interface TokenCreateResponse {
  data?: { id?: string } | null;
  id?: string;
  transactionId?: string;
  status?: string;
  statusUrl?: string;
}

/* ---- token.list ---------------------------------------------------------- */

interface TokenListItem {
  id: string;
  type?: string | null;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  totalSupply?: string | null;
  paused?: boolean | null;
  pausable?: { paused?: boolean | null } | null;
  createdAt?: string | null;
}

interface TokenListResponse {
  data?: TokenListItem[] | null;
}

/* ---- token.read / metadata / features ------------------------------------ */

interface TokenReadResponse {
  data?: {
    id?: string;
    type?: string | null;
    name?: string | null;
    symbol?: string | null;
    decimals?: number | null;
    totalSupply?: string | null;
    createdAt?: string | null;
    pausable?: { paused?: boolean | null } | null;
    capped?: { cap?: string | null } | null;
    collateral?: { collateral?: string | null } | null;
    yield?: unknown;
    price?: { amount?: string | null; currency?: string | null } | null;
  } | null;
}

interface TokenMetadataResponse {
  data?: {
    name?: string | null;
    symbol?: string | null;
    decimals?: number | null;
    isin?: string | null;
    countryCode?: string | null;
    assetClass?: string | null;
  } | null;
}

interface TokenFeaturesResponse {
  data?: Record<string, boolean> | string[] | null;
}

interface TokenPriceResponse {
  data?: { amount?: string | null; price?: string | null; currency?: string | null } | null;
}

/* ---- token.holders ------------------------------------------------------- */

interface TokenHoldersResponse {
  data?:
    | {
        id?: string;
        account?: { id?: string } | null;
        balance?: string | null;
        available?: string | null;
        frozen?: string | null;
        isFrozen?: boolean | null;
      }[]
    | null;
}

/* ---- token.events -------------------------------------------------------- */

interface TokenEventsResponse {
  data?:
    | {
        id?: string;
        eventType?: string | null;
        blockTimestamp?: string | null;
        transactionHash?: string | null;
        sender?: { id?: string } | null;
      }[]
    | null;
}

/* ---- token.compliance ---------------------------------------------------- */

interface TokenComplianceResponse {
  data?: {
    complianceModuleConfigs?:
      | { moduleAddress?: string | null; typeId?: string | null; parameters?: unknown }[]
      | null;
  } | null;
}

/* ---- stats --------------------------------------------------------------- */

interface TotalSupplyStatsResponse {
  data?: {
    totalSupplyHistory?: { t?: string; totalSupply?: string | number }[] | null;
  } | null;
}

interface WalletDistributionResponse {
  data?: {
    totalHolders?: number | null;
    buckets?: { label?: string; count?: number; percentage?: number }[] | null;
  } | null;
}

/* ---- settings.assetTypeTemplates / complianceTemplates ------------------- */

interface AssetTypeTemplateItem {
  id?: string;
  type?: string;
  name?: string;
  description?: string | null;
  decimals?: number | null;
}

interface AssetTypeTemplatesResponse {
  data?: AssetTypeTemplateItem[] | null;
}

interface ComplianceTemplateItem {
  id?: string;
  name?: string;
  description?: string | null;
  modules?: { typeId?: string; name?: string }[] | string[] | null;
}

interface ComplianceTemplatesResponse {
  data?: ComplianceTemplateItem[] | null;
}

/* ---- system.claimTopics -------------------------------------------------- */

interface ClaimTopicItem {
  id?: string;
  name?: string;
  signature?: string | null;
}

interface ClaimTopicsResponse {
  data?: ClaimTopicItem[] | null;
}

/* ---- async envelope + transaction poll ----------------------------------- */

interface AsyncAcceptedResponse {
  transactionId?: string;
  status?: string;
  statusUrl?: string;
}

interface TransactionStatusResponse {
  transactionId?: string;
  status?: string;
  subStatus?: string | null;
  transactionHash?: string | null;
  errorMessage?: string | null;
  receipt?: { status?: string } | null;
}

/* -------------------------------------------------------------------------- */
/*  The shapes the UI consumes.                                               */
/* -------------------------------------------------------------------------- */

export interface TokenSummary {
  id: string;
  type: string | null;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string | null;
  paused: boolean;
  createdAt: string | null;
}

export type TokenListResult =
  | { ok: true; tokens: TokenSummary[] }
  | { ok: false; error: NormalizedDalpError };

export interface ComplianceModuleSummary {
  /** Module type id (e.g. `CountryAllowListComplianceModule`). */
  typeId: string;
  address: string | null;
}

export interface ComplianceModuleOption {
  /** Stable id used in the wizard selection + token-create body. */
  typeId: string;
  name: string;
  description: string;
}

export interface ComplianceTemplateOption {
  id: string;
  name: string;
  description: string | null;
  moduleTypeIds: string[];
}

export interface ClaimTopicOption {
  id: string;
  name: string;
}

export interface AssetTypeOption {
  type: TokenType;
  name: string;
  description: string;
  defaultDecimals: number;
}

export interface WizardConfig {
  assetTypes: AssetTypeOption[];
  complianceModules: ComplianceModuleOption[];
  complianceTemplates: ComplianceTemplateOption[];
  claimTopics: ClaimTopicOption[];
  /** Surfaced when a feed couldn't be read, so the UI can note the fallback. */
  notices: string[];
}

export interface TokenHeader {
  id: string;
  type: string | null;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string | null;
  cap: string | null;
  paused: boolean;
  isin: string | null;
  countryCode: string | null;
  price: { amount: string | null; currency: string | null } | null;
  features: string[];
  createdAt: string | null;
}

export interface HolderRow {
  address: string;
  balance: string | null;
  available: string | null;
  frozen: string | null;
  isFrozen: boolean;
}

export interface EventRow {
  id: string;
  eventType: string;
  timestamp: string | null;
  transactionHash: string | null;
  sender: string | null;
}

export interface SupplyPoint {
  t: string;
  totalSupply: number;
}

export interface DistributionBucket {
  label: string;
  count: number;
  percentage: number;
}

export interface TokenDashboard {
  header: TokenHeader;
  holders: HolderRow[];
  events: EventRow[];
  compliance: ComplianceModuleSummary[];
  supplyHistory: SupplyPoint[];
  distribution: { totalHolders: number; buckets: DistributionBucket[] };
  /** Non-fatal read failures (e.g. stats lag) surfaced inline. */
  notices: string[];
}

export type TokenDashboardResult =
  | { ok: true; dashboard: TokenDashboard }
  | { ok: false; error: NormalizedDalpError };

/** Async mutation acceptance — transaction id to poll, or null when sync. */
export type MutationResult =
  | { ok: true; transactionId: string | null }
  | { ok: false; error: NormalizedDalpError };

/** Terminal-aware poll state surfaced to the live status UI. */
export type TxPhase = "queued" | "processing" | "completed" | "failed";

export interface TxStatus {
  ok: boolean;
  phase: TxPhase;
  rawStatus: string | null;
  subStatus: string | null;
  transactionHash: string | null;
  errorMessage: string | null;
  error?: NormalizedDalpError;
}

/* -------------------------------------------------------------------------- */
/*  Static catalogs (used as resilient fallbacks for the wizard feeds).        */
/* -------------------------------------------------------------------------- */

/** The asset types the SMART factory registry deploys, with sane defaults. */
const ASSET_TYPE_FALLBACK: AssetTypeOption[] = [
  {
    type: "bond",
    name: "Bond",
    description:
      "A debt instrument with a face value, maturity, and coupon. The default for fixed-income issuance.",
    defaultDecimals: 18,
  },
  {
    type: "equity",
    name: "Equity",
    description: "Tokenized shares with voting and dividend rights.",
    defaultDecimals: 18,
  },
  {
    type: "fund",
    name: "Fund",
    description: "A pooled investment vehicle with NAV-based pricing.",
    defaultDecimals: 18,
  },
  {
    type: "stablecoin",
    name: "Stablecoin",
    description: "A fiat-pegged token, typically 6 decimals, backed by reserves.",
    defaultDecimals: 6,
  },
  {
    type: "deposit",
    name: "Deposit",
    description: "A tokenized bank deposit redeemable against a reserve.",
    defaultDecimals: 2,
  },
];

/**
 * Module catalog from references/token.md. Used to label the modules a
 * compliance template references, and as the selectable list when the
 * compliance-templates feed is empty.
 */
const COMPLIANCE_MODULE_CATALOG: Record<string, { name: string; description: string }> = {
  CountryAllowListComplianceModule: {
    name: "Country allow-list",
    description: "Only holders whose identity country is on the allowed list can hold the token.",
  },
  CountryBlockListComplianceModule: {
    name: "Country block-list",
    description: "Holders from blocked countries are rejected.",
  },
  IdentityAllowListComplianceModule: {
    name: "Identity allow-list",
    description: "Only explicitly allow-listed identities can hold the token.",
  },
  IdentityBlockListComplianceModule: {
    name: "Identity block-list",
    description: "Block-listed identities are rejected from every transfer.",
  },
  SupplyLimitComplianceModule: {
    name: "Supply limit",
    description: "Caps the maximum total supply across the whole token.",
  },
  TimeLockComplianceModule: {
    name: "Time lock",
    description: "Restricts mints and transfers to configured time windows.",
  },
  TokenSupplyLimitComplianceModule: {
    name: "Per-holder supply cap",
    description: "Limits how much any single holder may hold.",
  },
};

function moduleOption(typeId: string): ComplianceModuleOption {
  const meta = COMPLIANCE_MODULE_CATALOG[typeId];
  return {
    typeId,
    name: meta?.name ?? typeId.replace(/ComplianceModule$/, ""),
    description: meta?.description ?? "A compliance rule enforced on every transfer.",
  };
}

/* -------------------------------------------------------------------------- */
/*  Helpers.                                                                  */
/* -------------------------------------------------------------------------- */

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

const SESSION_EXPIRED: NormalizedDalpError = {
  message: "Your session has expired. Sign in again.",
};

function transactionIdFrom(accepted: AsyncAcceptedResponse): string | null {
  if (accepted.transactionId && accepted.transactionId.length > 0) {
    return accepted.transactionId;
  }
  if (accepted.statusUrl && accepted.statusUrl.length > 0) {
    const trimmed = accepted.statusUrl.split("?")[0]?.replace(/\/$/, "") ?? "";
    const segment = trimmed.split("/").pop();
    if (segment && segment.length > 0) {
      return segment;
    }
  }
  return null;
}

function pausedOf(item: {
  paused?: boolean | null;
  pausable?: { paused?: boolean | null } | null;
}): boolean {
  return Boolean(item.pausable?.paused ?? item.paused ?? false);
}

function toFeatureList(features: TokenFeaturesResponse["data"]): string[] {
  if (!features) {
    return [];
  }
  if (Array.isArray(features)) {
    return features.filter((f): f is string => typeof f === "string");
  }
  return Object.entries(features)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([name]) => name);
}

/** Map any backend transaction-status string to a coarse phase. */
function phaseFor(raw: string | null | undefined, receiptStatus?: string | null): TxPhase {
  const value = (raw ?? "").toUpperCase();
  if (value === "COMPLETED" || value === "CONFIRMED") {
    return "completed";
  }
  if (value === "FAILED" || value === "DEAD_LETTER" || value === "CANCELLED") {
    return "failed";
  }
  if (receiptStatus) {
    return receiptStatus.toLowerCase() === "success" ? "completed" : "failed";
  }
  if (value === "QUEUED" || value === "RECEIVED" || value === "") {
    return "queued";
  }
  return "processing";
}

/** Friendly mapping for the compliance-block 409 so it reads as a state. */
export function friendlyMutationError(error: NormalizedDalpError): NormalizedDalpError {
  if (error.status === 409 || error.errorId === "TRANSFER_BLOCKED_BY_COMPLIANCE") {
    return {
      ...error,
      message: "Blocked by compliance",
      why:
        error.why ??
        "The rule engine rejected this — the recipient's KYC may not be approved or their country isn't eligible.",
      fix:
        error.fix ??
        "Make sure the recipient's KYC is approved and their on-chain claim has landed, then retry.",
    };
  }
  return error;
}

function walletVerification(pincode: string): WalletVerification {
  return { secretVerificationCode: pincode, verificationType: "PINCODE" };
}

/* -------------------------------------------------------------------------- */
/*  Reads — wizard config.                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Populate the deploy wizard: asset types, the compliance modules the issuer
 * can attach (sourced from the platform's compliance templates), the templates
 * themselves (one-click bundles), and the claim topics required identities can
 * carry. Each feed degrades gracefully to the static catalog so the wizard is
 * never a dead end if a settings read lags or 403s.
 */
export const fetchWizardConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<WizardConfig> => {
    const notices: string[] = [];
    const cookie = getIncomingCookie();

    if (cookie.length === 0) {
      return {
        assetTypes: ASSET_TYPE_FALLBACK,
        complianceModules: Object.keys(COMPLIANCE_MODULE_CATALOG).map(moduleOption),
        complianceTemplates: [],
        claimTopics: [],
        notices: ["Session expired — using the built-in template catalog."],
      };
    }

    const client = dalpForCurrentRequest();

    // Asset types — settings.assetTypeTemplates.list, fall back to the catalog.
    let assetTypes = ASSET_TYPE_FALLBACK;
    try {
      const settings = client.dapi.settings as {
        assetTypeTemplates?: { list?: (input: Record<string, never>) => Promise<unknown> };
      };
      if (typeof settings.assetTypeTemplates?.list === "function") {
        const res = (await settings.assetTypeTemplates.list({})) as AssetTypeTemplatesResponse;
        const items = res.data ?? [];
        const mapped = items
          .map((item): AssetTypeOption | null => {
            const type = (item.type ?? item.id) as TokenType | undefined;
            if (!type) {
              return null;
            }
            const fallback = ASSET_TYPE_FALLBACK.find((a) => a.type === type);
            return {
              type,
              name: item.name ?? fallback?.name ?? type,
              description: item.description ?? fallback?.description ?? "A tokenized asset.",
              defaultDecimals: item.decimals ?? fallback?.defaultDecimals ?? 18,
            };
          })
          .filter((a): a is AssetTypeOption => a !== null);
        if (mapped.length > 0) {
          assetTypes = mapped;
        }
      }
    } catch {
      notices.push("Asset-type templates couldn't be loaded — showing the standard catalog.");
    }

    // Compliance templates — settings.complianceTemplates.list.
    const complianceTemplates: ComplianceTemplateOption[] = [];
    const moduleTypeIds = new Set<string>();
    try {
      const settings = client.dapi.settings as {
        complianceTemplates?: { list?: (input: Record<string, never>) => Promise<unknown> };
      };
      if (typeof settings.complianceTemplates?.list === "function") {
        const res = (await settings.complianceTemplates.list({})) as ComplianceTemplatesResponse;
        for (const template of res.data ?? []) {
          if (!template.id) {
            continue;
          }
          const ids = normalizeModuleIds(template.modules);
          ids.forEach((id) => moduleTypeIds.add(id));
          complianceTemplates.push({
            id: template.id,
            name: template.name ?? template.id,
            description: template.description ?? null,
            moduleTypeIds: ids,
          });
        }
      }
    } catch {
      notices.push("Compliance templates couldn't be loaded.");
    }

    // The selectable module set: every module any template references, plus the
    // full catalog so the issuer can compose freely.
    Object.keys(COMPLIANCE_MODULE_CATALOG).forEach((id) => moduleTypeIds.add(id));
    const complianceModules = Array.from(moduleTypeIds).map(moduleOption);

    // Claim topics — system.claimTopics.list.
    const claimTopics: ClaimTopicOption[] = [];
    try {
      const res = (await client.dapi.system.claimTopics.list({})) as ClaimTopicsResponse;
      for (const topic of res.data ?? []) {
        if (topic.id) {
          claimTopics.push({ id: topic.id, name: topic.name ?? topic.id });
        }
      }
    } catch {
      notices.push("Claim topics couldn't be loaded.");
    }

    return { assetTypes, complianceModules, complianceTemplates, claimTopics, notices };
  },
);

function normalizeModuleIds(modules: ComplianceTemplateItem["modules"]): string[] {
  if (!modules) {
    return [];
  }
  const ids: string[] = [];
  for (const entry of modules) {
    if (typeof entry === "string") {
      ids.push(entry);
    } else if (entry && typeof entry === "object" && typeof entry.typeId === "string") {
      ids.push(entry.typeId);
    }
  }
  return ids;
}

/* -------------------------------------------------------------------------- */
/*  Reads — token list + dashboard.                                           */
/* -------------------------------------------------------------------------- */

/** List the org's deployed tokens (`token.list`). */
export const fetchTokens = createServerFn({ method: "GET" }).handler(
  async (): Promise<TokenListResult> => {
    const cookie = getIncomingCookie();
    if (cookie.length === 0) {
      return { ok: false, error: SESSION_EXPIRED };
    }
    try {
      const client = dalpForCurrentRequest();
      const res = (await client.dapi.token.list({
        query: { page: { limit: 100, offset: 0 } },
      })) as TokenListResponse;

      const tokens = (res.data ?? []).map(
        (item): TokenSummary => ({
          id: item.id,
          type: item.type ?? null,
          name: item.name ?? "Untitled token",
          symbol: item.symbol ?? "—",
          decimals: item.decimals ?? 18,
          totalSupply: item.totalSupply ?? null,
          paused: pausedOf(item),
          createdAt: item.createdAt ?? null,
        }),
      );
      return { ok: true, tokens };
    } catch (error) {
      return { ok: false, error: normalizeDalpError(error) };
    }
  },
);

/**
 * Build the full bond dashboard. Header (`token.read` + `token.metadata` +
 * `token.features` + `token.price`) is required; holders, events, compliance,
 * and stats are best-effort — a lagging indexer on any of them surfaces a
 * notice rather than sinking the page.
 */
export const fetchTokenDashboard = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown): { tokenAddress: string } => {
    const input = (raw ?? {}) as { tokenAddress?: unknown };
    const tokenAddress = String(input.tokenAddress ?? "").trim();
    if (tokenAddress.length === 0) {
      throw new Error("A token address is required.");
    }
    return { tokenAddress };
  })
  .handler(async ({ data }): Promise<TokenDashboardResult> => {
    const cookie = getIncomingCookie();
    if (cookie.length === 0) {
      return { ok: false, error: SESSION_EXPIRED };
    }

    const { tokenAddress } = data;
    const client = dalpForCurrentRequest();
    const notices: string[] = [];

    let read: TokenReadResponse;
    try {
      read = (await client.dapi.token.read({ params: { tokenAddress } })) as TokenReadResponse;
    } catch (error) {
      return { ok: false, error: normalizeDalpError(error) };
    }
    if (!read.data) {
      return {
        ok: false,
        error: { message: "This token couldn't be found.", status: 404 },
      };
    }

    const [metadata, features, price] = await Promise.all([
      safe<TokenMetadataResponse>(
        () => client.dapi.token.metadata({ params: { tokenAddress } }),
        notices,
        "metadata",
      ),
      safe<TokenFeaturesResponse>(
        () => client.dapi.token.features({ params: { tokenAddress } }),
        notices,
        "features",
      ),
      safe<TokenPriceResponse>(
        () => client.dapi.token.price({ params: { tokenAddress } }),
        notices,
        "price",
      ),
    ]);

    const tokenData = read.data;
    const priceData = price?.data ?? null;
    const header: TokenHeader = {
      id: tokenData.id ?? tokenAddress,
      type: tokenData.type ?? null,
      name: metadata?.data?.name ?? tokenData.name ?? "Untitled token",
      symbol: metadata?.data?.symbol ?? tokenData.symbol ?? "—",
      decimals: metadata?.data?.decimals ?? tokenData.decimals ?? 18,
      totalSupply: tokenData.totalSupply ?? null,
      cap: tokenData.capped?.cap ?? null,
      paused: pausedOf(tokenData),
      isin: metadata?.data?.isin ?? null,
      countryCode: metadata?.data?.countryCode ?? null,
      price: priceData
        ? {
            amount: priceData.amount ?? priceData.price ?? null,
            currency: priceData.currency ?? null,
          }
        : null,
      features: toFeatureList(features?.data ?? null),
      createdAt: tokenData.createdAt ?? null,
    };

    const [holdersRes, eventsRes, complianceRes, supplyRes, distRes] = await Promise.all([
      safe<TokenHoldersResponse>(
        () =>
          client.dapi.token.holders({
            params: { tokenAddress },
            query: { page: { limit: 25, offset: 0 } },
          }),
        notices,
        "holders",
      ),
      safe<TokenEventsResponse>(
        () =>
          client.dapi.token.events({
            params: { tokenAddress },
            query: {
              page: { limit: 25, offset: 0 },
              sortBy: "blockTimestamp",
              sortDirection: "desc",
            },
          }),
        notices,
        "events",
      ),
      safe<TokenComplianceResponse>(
        () => client.dapi.token.compliance({ params: { tokenAddress } }),
        notices,
        "compliance",
      ),
      safe<TotalSupplyStatsResponse>(
        () => client.dapi.token.statsTotalSupply({ params: { tokenAddress }, query: { days: 30 } }),
        notices,
        "supply stats",
      ),
      safe<WalletDistributionResponse>(
        () => client.dapi.token.statsWalletDistribution({ params: { tokenAddress } }),
        notices,
        "wallet distribution",
      ),
    ]);

    const holders: HolderRow[] = (holdersRes?.data ?? []).map((h) => ({
      address: h.account?.id ?? h.id ?? "—",
      balance: h.balance ?? null,
      available: h.available ?? null,
      frozen: h.frozen ?? null,
      isFrozen: Boolean(h.isFrozen),
    }));

    const events: EventRow[] = (eventsRes?.data ?? []).map((e, index) => ({
      id: e.id ?? e.transactionHash ?? `event-${index}`,
      eventType: e.eventType ?? "Event",
      timestamp: e.blockTimestamp ?? null,
      transactionHash: e.transactionHash ?? null,
      sender: e.sender?.id ?? null,
    }));

    const compliance: ComplianceModuleSummary[] = (
      complianceRes?.data?.complianceModuleConfigs ?? []
    ).map((c) => ({
      typeId: c.typeId ?? c.moduleAddress ?? "Unknown module",
      address: c.moduleAddress ?? null,
    }));

    const supplyHistory: SupplyPoint[] = (supplyRes?.data?.totalSupplyHistory ?? [])
      .map((point) => ({
        t: point.t ?? "",
        totalSupply: Number(point.totalSupply ?? 0),
      }))
      .filter((p) => p.t.length > 0 && Number.isFinite(p.totalSupply));

    const distribution = {
      totalHolders: distRes?.data?.totalHolders ?? holders.length,
      buckets: (distRes?.data?.buckets ?? [])
        .map((b) => ({
          label: b.label ?? "—",
          count: b.count ?? 0,
          percentage: b.percentage ?? 0,
        }))
        .filter((b) => b.count > 0),
    };

    return {
      ok: true,
      dashboard: { header, holders, events, compliance, supplyHistory, distribution, notices },
    };
  });

/** Run a best-effort read; on failure push a notice and return null. */
async function safe<T>(
  run: () => Promise<unknown>,
  notices: string[],
  label: string,
): Promise<T | null> {
  try {
    return (await run()) as T;
  } catch {
    notices.push(`Live ${label} is temporarily unavailable — the indexer may be catching up.`);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Mutations.                                                                */
/* -------------------------------------------------------------------------- */

interface DeployInput {
  type: TokenType;
  name: string;
  symbol: string;
  decimals: number;
  countryCode: string;
  pincode: string;
  basePrice?: string;
  priceCurrency?: string;
  cap?: string;
  complianceModules: string[];
}

function validateDeploy(raw: unknown): DeployInput {
  const input = (raw ?? {}) as Record<string, unknown>;
  const type = String(input.type ?? "") as TokenType;
  const name = String(input.name ?? "").trim();
  const symbol = String(input.symbol ?? "")
    .trim()
    .toUpperCase();
  const decimals = Number(input.decimals ?? 18);
  const countryCode = String(input.countryCode ?? "").trim();
  const pincode = String(input.pincode ?? "").trim();
  const basePrice = String(input.basePrice ?? "").trim();
  const priceCurrency = String(input.priceCurrency ?? "")
    .trim()
    .toUpperCase();
  const cap = String(input.cap ?? "").trim();
  const complianceModules = Array.isArray(input.complianceModules)
    ? input.complianceModules.map((m) => String(m)).filter((m) => m.length > 0)
    : [];

  const allowed: TokenType[] = ["bond", "equity", "fund", "stablecoin", "deposit"];
  if (!allowed.includes(type)) {
    throw new Error("Choose an asset type.");
  }
  if (name.length < 2) {
    throw new Error("Give the token a name (at least 2 characters).");
  }
  if (symbol.length < 2 || symbol.length > 12) {
    throw new Error("Symbol must be 2–12 characters.");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("Decimals must be a whole number between 0 and 18.");
  }
  if (!/^\d{3}$/.test(countryCode)) {
    throw new Error("Country code must be the ISO 3166-1 numeric code (e.g. 840 for the US).");
  }
  if (pincode.length < 4) {
    throw new Error("Enter your wallet verification code to deploy.");
  }

  return {
    type,
    name,
    symbol,
    decimals,
    countryCode,
    pincode,
    complianceModules,
    ...(basePrice.length > 0 ? { basePrice } : {}),
    ...(priceCurrency.length > 0 ? { priceCurrency } : {}),
    ...(cap.length > 0 ? { cap } : {}),
  };
}

/**
 * Create & deploy a token (`token.create` — async). Returns the transaction id
 * to poll. A fresh Idempotency-Key is set per call via `dalpForMutation`; the
 * pincode is forwarded as the `walletVerification` payload. The chosen
 * compliance modules bundle into the create body's `compliance` field.
 */
export const deployToken = createServerFn({ method: "POST" })
  .inputValidator(validateDeploy)
  .handler(
    async ({
      data,
    }): Promise<
      | { ok: true; transactionId: string | null; tokenAddress: string | null }
      | { ok: false; error: NormalizedDalpError }
    > => {
      const cookie = getIncomingCookie();
      if (cookie.length === 0) {
        return { ok: false, error: SESSION_EXPIRED };
      }

      try {
        const client = dalpForMutation(cookie, uuid());
        const compliance = data.complianceModules.map((typeId) => ({ typeId }));
        const res = (await client.dapi.token.create({
          body: {
            type: data.type,
            name: data.name,
            symbol: data.symbol,
            decimals: data.decimals,
            countryCode: data.countryCode,
            ...(data.basePrice ? { basePrice: data.basePrice } : {}),
            ...(data.priceCurrency ? { priceCurrency: data.priceCurrency } : {}),
            ...(data.cap ? { cap: data.cap } : {}),
            ...(compliance.length > 0 ? { compliance } : {}),
            walletVerification: walletVerification(data.pincode),
          },
        })) as TokenCreateResponse;

        const tokenAddress = res.data?.id ?? res.id ?? null;
        return { ok: true, transactionId: transactionIdFrom(res), tokenAddress };
      } catch (error) {
        return { ok: false, error: normalizeDalpError(error) };
      }
    },
  );

/** The set of token actions the dashboard action panel drives. */
export type TokenAction =
  | "mint"
  | "transfer"
  | "freeze"
  | "pause"
  | "unpause"
  | "setCap"
  | "setPrice";

interface ActionInput {
  tokenAddress: string;
  action: TokenAction;
  pincode: string;
  /** mint / transfer / freeze recipient. */
  address?: string;
  /** mint / transfer / freeze / setCap / setPrice amount. */
  amount?: string;
  /** setPrice currency. */
  currencyCode?: string;
}

function validateAction(raw: unknown): ActionInput {
  const input = (raw ?? {}) as Record<string, unknown>;
  const tokenAddress = String(input.tokenAddress ?? "").trim();
  const action = String(input.action ?? "") as TokenAction;
  const pincode = String(input.pincode ?? "").trim();
  const address = String(input.address ?? "").trim();
  const amount = String(input.amount ?? "").trim();
  const currencyCode = String(input.currencyCode ?? "")
    .trim()
    .toUpperCase();

  const actions: TokenAction[] = [
    "mint",
    "transfer",
    "freeze",
    "pause",
    "unpause",
    "setCap",
    "setPrice",
  ];
  if (tokenAddress.length === 0) {
    throw new Error("A token address is required.");
  }
  if (!actions.includes(action)) {
    throw new Error("Unknown action.");
  }
  if (pincode.length < 4) {
    throw new Error("Enter your wallet verification code to authorize this action.");
  }

  const needsAddress = action === "mint" || action === "transfer" || action === "freeze";
  const needsAmount =
    action === "mint" ||
    action === "transfer" ||
    action === "freeze" ||
    action === "setCap" ||
    action === "setPrice";

  if (needsAddress && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Enter a valid 0x… wallet address.");
  }
  if (needsAmount) {
    if (amount.length === 0 || Number(amount) <= 0 || Number.isNaN(Number(amount))) {
      throw new Error("Enter an amount greater than zero.");
    }
  }
  if (action === "setPrice" && currencyCode.length < 3) {
    throw new Error("Enter a 3-letter currency code (e.g. USD).");
  }

  return {
    tokenAddress,
    action,
    pincode,
    ...(needsAddress ? { address } : {}),
    ...(needsAmount ? { amount } : {}),
    ...(action === "setPrice" ? { currencyCode } : {}),
  };
}

/** The untyped token namespace surface we touch for mutations. */
type TokenMutationFn = (input: unknown) => Promise<unknown>;
interface TokenNamespace {
  mint: TokenMutationFn;
  transfer: TokenMutationFn;
  freezeAddress: TokenMutationFn;
  pause: TokenMutationFn;
  unpause: TokenMutationFn;
  setCap: TokenMutationFn;
  setPrice: TokenMutationFn;
}

/**
 * Run a token mutation gated on the wallet-verification pincode. mint /
 * transfer are async (return a transaction id to poll); freeze / pause /
 * unpause / setCap / setPrice are synchronous. Idempotency-Key is fresh per
 * call. Compliance blocks (409) come back as a friendly normalized error.
 */
export const runTokenAction = createServerFn({ method: "POST" })
  .inputValidator(validateAction)
  .handler(async ({ data }): Promise<MutationResult> => {
    const cookie = getIncomingCookie();
    if (cookie.length === 0) {
      return { ok: false, error: SESSION_EXPIRED };
    }

    try {
      const client = dalpForMutation(cookie, uuid());
      const token = client.dapi.token as unknown as TokenNamespace;
      const params = { tokenAddress: data.tokenAddress };
      const verification = walletVerification(data.pincode);

      let response: AsyncAcceptedResponse = {};

      switch (data.action) {
        case "mint":
          response = (await token.mint({
            params,
            body: {
              recipients: data.address,
              amounts: data.amount,
              walletVerification: verification,
            },
          })) as AsyncAcceptedResponse;
          break;
        case "transfer":
          response = (await token.transfer({
            params,
            body: {
              transfers: [{ to: data.address, amount: data.amount }],
              walletVerification: verification,
            },
          })) as AsyncAcceptedResponse;
          break;
        case "freeze":
          await token.freezeAddress({
            params,
            body: { userAddress: data.address, freeze: true, walletVerification: verification },
          });
          break;
        case "pause":
          await token.pause({ params, body: { walletVerification: verification } });
          break;
        case "unpause":
          await token.unpause({ params, body: { walletVerification: verification } });
          break;
        case "setCap":
          await token.setCap({
            params,
            body: { newCap: data.amount, walletVerification: verification },
          });
          break;
        case "setPrice":
          await token.setPrice({
            params,
            body: {
              price: data.amount,
              currencyCode: data.currencyCode,
              walletVerification: verification,
            },
          });
          break;
      }

      const async = data.action === "mint" || data.action === "transfer";
      return { ok: true, transactionId: async ? transactionIdFrom(response) : null };
    } catch (error) {
      return { ok: false, error: friendlyMutationError(normalizeDalpError(error)) };
    }
  });

/* -------------------------------------------------------------------------- */
/*  Transaction poll (deploy + async actions).                                */
/* -------------------------------------------------------------------------- */

interface TransactionNamespace {
  status?: (input: { transactionId: string }) => Promise<unknown>;
  read?: (input: { transactionId?: string; transactionHash?: string }) => Promise<unknown>;
}

async function pollTransaction(
  transaction: TransactionNamespace,
  transactionId: string,
): Promise<TransactionStatusResponse> {
  if (typeof transaction.status === "function") {
    return (await transaction.status({ transactionId })) as TransactionStatusResponse;
  }
  if (typeof transaction.read === "function") {
    return (await transaction.read({ transactionId })) as TransactionStatusResponse;
  }
  throw new Error("The transaction status endpoint is unavailable.");
}

/** One poll tick against an async token transaction. */
export const readTokenTxStatus = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown): { transactionId: string } => {
    const input = (raw ?? {}) as { transactionId?: unknown };
    const transactionId = String(input.transactionId ?? "").trim();
    if (transactionId.length === 0) {
      throw new Error("A transaction id is required.");
    }
    return { transactionId };
  })
  .handler(async ({ data }): Promise<TxStatus> => {
    const cookie = getIncomingCookie();
    if (cookie.length === 0) {
      return {
        ok: false,
        phase: "failed",
        rawStatus: null,
        subStatus: null,
        transactionHash: null,
        errorMessage: SESSION_EXPIRED.message,
        error: SESSION_EXPIRED,
      };
    }

    try {
      const client = dalpForCurrentRequest();
      const transaction = client.dapi.transaction as TransactionNamespace;
      const tx = await pollTransaction(transaction, data.transactionId);
      return {
        ok: true,
        phase: phaseFor(tx.status, tx.receipt?.status),
        rawStatus: tx.status ?? (tx.receipt ? "MINED" : null),
        subStatus: tx.subStatus ?? null,
        transactionHash: tx.transactionHash ?? null,
        errorMessage: tx.errorMessage ?? null,
      };
    } catch (error) {
      const normalized = normalizeDalpError(error);
      return {
        ok: false,
        phase: "processing",
        rawStatus: null,
        subStatus: null,
        transactionHash: null,
        errorMessage: normalized.message,
        error: normalized,
      };
    }
  });
