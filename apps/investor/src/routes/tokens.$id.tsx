import { createFileRoute, Link, type LinkProps, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowLeftRight,
  Coins,
  Hash,
  Info,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { AppShell } from "~/components/app-shell";
import {
  TransferDialog,
  type TransferOutcome,
  type TransferTarget,
} from "~/components/transfer-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { StatusBadge } from "~/components/ui/status-badge";
import {
  dalpForCurrentRequest,
  dalpForCurrentRequestWithIdempotency,
  getIncomingCookie,
  isComplianceBlock,
  pollTransaction,
} from "~/lib/dalp";
import { normalizeDalpError } from "~/lib/dalp-errors";
import { formatDecimalString } from "~/lib/decimal";
import {
  filterContacts,
  shortenAddress,
  type ContactSuggestion,
  type ContactsListResponse,
  type LoaderResult,
  type TokenHolderResponse,
  type TokenMetadataResponse,
  type TokenReadResponse,
  type TransferResponse,
  type UserMeResponse,
} from "~/lib/dalp-types";
import { useSignOut } from "~/lib/use-sign-out";
import { RouteError } from "./portfolio";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TOKENS_TO = "/tokens" as LinkProps["to"];

interface AssetDetail {
  userName: string | null;
  kycStatus: string | null;
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  type: string | null;
  paused: boolean;
  description: string | null;
  isin: string | null;
  priceCurrency: string | null;
  basePrice: string | null;
  /** My balance of this token (human units), null if I hold none. */
  balance: string | null;
  available: string | null;
}

type DetailResult = LoaderResult<AssetDetail>;

// ===========================================================================
// Loader — token.read + token.metadata + token.holder (my position).
// ===========================================================================

const loadAssetDetail = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown): { tokenAddress: string } => {
    const input = (raw ?? {}) as { tokenAddress?: unknown };
    const tokenAddress = String(input.tokenAddress ?? "").trim();
    if (!ADDRESS_RE.test(tokenAddress)) {
      throw new Error("That doesn't look like a valid asset address.");
    }
    return { tokenAddress };
  })
  .handler(async ({ data }): Promise<DetailResult> => {
    if (getIncomingCookie().length === 0) {
      return { ok: false, authed: false, error: { message: "Sign in to view this asset." } };
    }

    const { tokenAddress } = data;
    try {
      const client = dalpForCurrentRequest();

      const me = (await client.dapi.user.me({})) as UserMeResponse;
      if (!me.data) {
        return {
          ok: false,
          authed: false,
          error: { message: "Your session has expired. Sign in again." },
        };
      }

      const [token, metadata] = await Promise.all([
        client.dapi.token.read({ params: { tokenAddress } }) as Promise<TokenReadResponse>,
        client.dapi.token
          .metadata({ params: { tokenAddress } })
          .catch(() => ({ data: null }) as TokenMetadataResponse) as Promise<TokenMetadataResponse>,
      ]);

      if (!token.data) {
        return { ok: false, authed: true, error: { message: "We couldn't find this asset." } };
      }

      // My holding — present only when I hold a balance; absent is not an error.
      let balance: string | null = null;
      let available: string | null = null;
      if (me.data.wallet) {
        try {
          const holder = (await client.dapi.token.holder({
            params: { tokenAddress },
            query: { holderAddress: me.data.wallet },
          })) as TokenHolderResponse;
          if (holder.data?.holder) {
            balance = holder.data.holder.balance ?? "0";
            available = holder.data.holder.available ?? balance;
          }
        } catch {
          balance = null;
          available = null;
        }
      }

      const decimals = token.data.decimals ?? metadata.data?.decimals ?? 18;

      return {
        ok: true,
        data: {
          userName: me.data.name ?? me.data.email ?? null,
          kycStatus: me.data.kycStatus ?? null,
          tokenAddress,
          name: token.data.name ?? metadata.data?.name ?? "Unnamed asset",
          symbol: token.data.symbol ?? metadata.data?.symbol ?? "—",
          decimals,
          type: token.data.type ?? null,
          paused: token.data.pausable?.paused ?? token.data.paused ?? false,
          description: metadata.data?.description ?? null,
          isin: metadata.data?.isin ?? null,
          priceCurrency: metadata.data?.priceCurrency ?? null,
          basePrice: metadata.data?.basePrice ?? null,
          balance,
          available,
        },
      };
    } catch (error) {
      const normalized = normalizeDalpError(error);
      return { ok: false, authed: normalized.status !== 401, error: normalized };
    }
  });

// ===========================================================================
// Transfer mutation — token.transfer (async) + poll transaction.read.
// Surfaces the compliance 409 as a friendly outcome, never a crash.
// ===========================================================================

interface TransferInput {
  tokenAddress: string;
  to: string;
  amount: string;
}

const submitTransfer = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): TransferInput => {
    const input = (raw ?? {}) as Partial<Record<keyof TransferInput, unknown>>;
    const tokenAddress = String(input.tokenAddress ?? "").trim();
    const to = String(input.to ?? "").trim();
    const amount = String(input.amount ?? "").trim();
    if (!ADDRESS_RE.test(tokenAddress)) {
      throw new Error("Invalid asset address.");
    }
    if (!ADDRESS_RE.test(to)) {
      throw new Error("Enter a valid recipient wallet address.");
    }
    if (!/^\d*\.?\d+$/.test(amount)) {
      throw new Error("Enter a valid amount.");
    }
    return { tokenAddress, to, amount };
  })
  .handler(async ({ data }): Promise<TransferOutcome> => {
    if (getIncomingCookie().length === 0) {
      return { kind: "failed", message: "Your session has expired. Sign in again." };
    }

    try {
      // token.transfer is idempotency-required + async — fresh key per mutation.
      const client = dalpForCurrentRequestWithIdempotency(crypto.randomUUID());
      const result = (await client.dapi.token.transfer({
        params: { tokenAddress: data.tokenAddress },
        // Documented batch-transfer body (references/token.md). Single-row batch.
        body: { transfers: [{ to: data.to, amount: data.amount }] },
      })) as TransferResponse;

      const transactionId = result.data?.id ?? result.data?.transactionId ?? null;
      if (!transactionId) {
        // No id to poll — the call returned without enqueuing a trackable tx.
        return { kind: "pending" };
      }

      // Poll transaction.read on the SAME session client until terminal.
      const settled = await pollTransaction(dalpForCurrentRequest(), transactionId);
      if (settled.timedOut) {
        return { kind: "pending" };
      }
      if (settled.status === "failed") {
        return {
          kind: "failed",
          message: "The transfer was submitted but failed on-chain.",
          fix: "It may have been rejected by the asset's rules. Check your activity feed.",
        };
      }
      return { kind: "completed", transactionHash: settled.transactionHash };
    } catch (error) {
      const normalized = normalizeDalpError(error);
      if (isComplianceBlock(normalized)) {
        return {
          kind: "compliance_blocked",
          message: normalized.message,
          fix: normalized.fix,
        };
      }
      return {
        kind: "failed",
        message: normalized.message,
        fix: normalized.fix,
      };
    }
  });

// ===========================================================================
// Contacts search — `contacts.list` for the recipient autocomplete.
//
// The v2 contacts namespace has NO `search` route (it was v1-only and is not
// wired into the dapi client), so we list the saved contacts and filter by the
// typed query string client-side. The autocomplete UX is unchanged.
// ===========================================================================

const searchContacts = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown): { q: string } => {
    const input = (raw ?? {}) as { q?: unknown };
    return { q: String(input.q ?? "").trim() };
  })
  .handler(async ({ data }): Promise<ContactSuggestion[]> => {
    if (data.q.length < 2 || getIncomingCookie().length === 0) {
      return [];
    }
    try {
      const client = dalpForCurrentRequest();
      const result = (await client.dapi.contacts.list({
        query: { page: { limit: 100, offset: 0 } },
      })) as ContactsListResponse;
      return filterContacts(result.data ?? [], data.q);
    } catch {
      return [];
    }
  });

export const Route = createFileRoute("/tokens/$id")({
  loader: ({ params }) => loadAssetDetail({ data: { tokenAddress: params.id } }),
  component: AssetDetailPage,
  pendingComponent: AssetDetailPending,
});

// ===========================================================================
// Page
// ===========================================================================

function AssetDetailPage() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const { signOut, signingOut } = useSignOut();
  const [transferOpen, setTransferOpen] = useState(false);

  if (!result.ok) {
    return (
      <RouteError
        authed={result.authed}
        error={result.error}
        currentPath="/tokens"
        pageTitle="Asset"
      />
    );
  }

  const asset = result.data;
  const kycApproved = asset.kycStatus === "approved";
  const holdsBalance = asset.available !== null && asset.available !== "0";
  const canTransfer = kycApproved && holdsBalance && !asset.paused;

  const transferTarget: TransferTarget = {
    tokenAddress: asset.tokenAddress,
    symbol: asset.symbol,
    name: asset.name,
    decimals: asset.decimals,
    available: asset.available ?? "0",
  };

  async function handleTransfer(input: { to: string; amount: string }): Promise<TransferOutcome> {
    return submitTransfer({
      data: { tokenAddress: asset.tokenAddress, to: input.to, amount: input.amount },
    });
  }

  async function handleSearchContacts(query: string): Promise<ContactSuggestion[]> {
    return searchContacts({ data: { q: query } });
  }

  return (
    <AppShell
      userName={asset.userName ?? undefined}
      kycStatus={asset.kycStatus ?? undefined}
      currentPath="/tokens"
      onSignOut={signOut}
      signingOut={signingOut}
    >
      <div className="mb-6">
        <Link
          to={TOKENS_TO}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 underline-offset-4 hover:text-neutral-900 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to assets
        </Link>
      </div>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-base font-semibold text-brand-700 ring-1 ring-brand-500/15">
            {asset.symbol.slice(0, 3).toUpperCase()}
          </span>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
                {asset.name}
              </h1>
              {asset.paused ? (
                <StatusBadge status="blocked" label="Paused" />
              ) : (
                <StatusBadge status="active" label="Tradable" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
              <span className="font-medium text-neutral-700">{asset.symbol}</span>
              {asset.type ? <Badge variant="neutral">{asset.type}</Badge> : null}
              <span className="font-mono text-xs">{shortenAddress(asset.tokenAddress)}</span>
            </div>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void router.invalidate()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-2">
          <AboutCard asset={asset} />
        </section>

        <section className="space-y-6">
          <HoldingCard
            asset={asset}
            canTransfer={canTransfer}
            kycApproved={kycApproved}
            holdsBalance={holdsBalance}
            onTransfer={() => setTransferOpen(true)}
          />
        </section>
      </div>

      <TransferDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        token={transferTarget}
        onTransfer={handleTransfer}
        onSearchContacts={handleSearchContacts}
        onCompleted={() => void router.invalidate()}
      />
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// About / metadata
// ---------------------------------------------------------------------------

function AboutCard({ asset }: { asset: AssetDetail }) {
  const rows: { label: string; value: string }[] = [
    { label: "Symbol", value: asset.symbol },
    { label: "Decimals", value: String(asset.decimals) },
  ];
  if (asset.type) {
    rows.push({ label: "Asset type", value: asset.type });
  }
  if (asset.isin) {
    rows.push({ label: "ISIN", value: asset.isin });
  }
  if (asset.basePrice) {
    rows.push({
      label: "Base price",
      value: `${formatDecimalString(asset.basePrice)}${asset.priceCurrency ? ` ${asset.priceCurrency}` : ""}`,
    });
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2">
          <Info className="size-4 text-neutral-400" aria-hidden="true" />
          About this asset
        </CardTitle>
        <CardDescription>
          {asset.description ?? "Reference details for this compliant asset."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="bg-white px-4 py-3">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">{row.label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-neutral-900">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-start gap-2 rounded-lg bg-neutral-50 px-4 py-3">
          <Hash className="mt-0.5 size-4 shrink-0 text-neutral-400" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Contract address</p>
            <p className="mt-0.5 break-all font-mono text-sm text-neutral-700">
              {asset.tokenAddress}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// My holding + transfer entry point
// ---------------------------------------------------------------------------

interface HoldingCardProps {
  asset: AssetDetail;
  canTransfer: boolean;
  kycApproved: boolean;
  holdsBalance: boolean;
  onTransfer: () => void;
}

function HoldingCard({
  asset,
  canTransfer,
  kycApproved,
  holdsBalance,
  onTransfer,
}: HoldingCardProps) {
  const KYC_TO = "/kyc" as LinkProps["to"];

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-neutral-400" aria-hidden="true" />
          Your position
        </CardTitle>
        <CardDescription>What you currently hold of {asset.symbol}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg bg-neutral-50 px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Balance</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-neutral-900">
            {asset.balance !== null ? formatDecimalString(asset.balance) : "0"}{" "}
            <span className="text-base font-medium text-neutral-500">{asset.symbol}</span>
          </p>
          {asset.available !== null && asset.available !== asset.balance ? (
            <p className="mt-1 text-xs text-neutral-500">
              {formatDecimalString(asset.available)} available to transfer
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          variant="brand"
          className="w-full"
          disabled={!canTransfer}
          onClick={onTransfer}
        >
          <ArrowLeftRight className="size-4" aria-hidden="true" />
          Transfer {asset.symbol}
        </Button>

        {!canTransfer ? (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="space-y-1.5">
                {!kycApproved ? (
                  <>
                    <p className="font-medium">Verify your identity to transfer</p>
                    <p className="text-pretty">
                      Compliant transfers need an approved KYC claim on-chain. Finish KYC, then come
                      back here to move your assets.
                    </p>
                    <Link
                      to={KYC_TO}
                      className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
                    >
                      Go to KYC
                    </Link>
                  </>
                ) : asset.paused ? (
                  <p className="text-pretty">
                    This asset is paused by the issuer, so transfers are temporarily disabled.
                  </p>
                ) : !holdsBalance ? (
                  <p className="text-pretty">
                    You don't hold any {asset.symbol} yet, so there's nothing to transfer.
                  </p>
                ) : (
                  <p className="text-pretty">Transfers aren't available right now.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {!holdsBalance && kycApproved && !asset.paused ? (
          <EmptyHoldingHint symbol={asset.symbol} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyHoldingHint({ symbol }: { symbol: string }) {
  return (
    <p className="flex items-center gap-2 text-xs text-neutral-500">
      <Coins className="size-3.5 shrink-0" aria-hidden="true" />
      You'll be able to transfer {symbol} once you hold a balance.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Loading + error
// ---------------------------------------------------------------------------

function AssetDetailPending() {
  return (
    <AppShell currentPath="/tokens">
      <div className="mb-6">
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="mb-6 flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-14 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-28" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
