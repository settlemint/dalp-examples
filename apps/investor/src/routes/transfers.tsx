import { createFileRoute, Link, type LinkProps, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeftRight, ArrowRight, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AppShell } from "~/components/app-shell";
import {
  TransferDialog,
  type TransferOutcome,
  type TransferTarget,
} from "~/components/transfer-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Skeleton } from "~/components/ui/skeleton";
import { StatusBadge } from "~/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
  tokenAddressOf,
  type ActivityView,
  type ContactSuggestion,
  type ContactsListResponse,
  type HoldingView,
  type LoaderResult,
  type TransferResponse,
  type UserAssetsResponse,
  type UserEventsResponse,
  type UserMeResponse,
} from "~/lib/dalp-types";
import { useSignOut } from "~/lib/use-sign-out";
import { RouteError } from "./portfolio";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TOKENS_TO = "/tokens" as LinkProps["to"];
const KYC_TO = "/kyc" as LinkProps["to"];

interface TransfersData {
  userName: string | null;
  kycStatus: string | null;
  holdings: HoldingView[];
  transfers: ActivityView[];
}

type TransfersResult = LoaderResult<TransfersData>;

// ===========================================================================
// Loader — transferable holdings (user.assets) + recent transfers (user.events).
// ===========================================================================

const loadTransfers = createServerFn({ method: "GET" }).handler(
  async (): Promise<TransfersResult> => {
    if (getIncomingCookie().length === 0) {
      return { ok: false, authed: false, error: { message: "Sign in to send a transfer." } };
    }

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

      const [assets, events] = await Promise.all([
        client.dapi.user.assets({
          query: { page: { limit: 50, offset: 0 } },
        }) as Promise<UserAssetsResponse>,
        client.dapi.user.events({
          query: {
            page: { limit: 20, offset: 0 },
            filters: [{ id: "eventType", operator: "eq", value: "Transfer" }],
          },
        }) as Promise<UserEventsResponse>,
      ]);

      const holdings: HoldingView[] = (assets.data ?? []).flatMap((row) => {
        const address = tokenAddressOf(row.token);
        const available = row.available ?? row.balance ?? "0";
        if (!address || available === "0") {
          return [];
        }
        return [
          {
            tokenAddress: address,
            name: row.token?.name ?? "Unknown asset",
            symbol: row.token?.symbol ?? "—",
            decimals: row.token?.decimals ?? 18,
            type: row.token?.type ?? null,
            balance: row.balance ?? "0",
            available,
          },
        ];
      });

      const transfers: ActivityView[] = (events.data ?? []).map((event, index) => ({
        id: event.id ?? `${event.transactionHash ?? "transfer"}-${index}`,
        eventType: event.eventType ?? "Transfer",
        timestamp: event.blockTimestamp ?? event.createdAt ?? null,
        tokenSymbol: event.token?.symbol ?? null,
        counterparty: event.to ?? event.from ?? null,
        amount: event.amount ?? null,
        transactionHash: event.transactionHash ?? null,
      }));

      return {
        ok: true,
        data: {
          userName: me.data.name ?? me.data.email ?? null,
          kycStatus: me.data.kycStatus ?? null,
          holdings,
          transfers,
        },
      };
    } catch (error) {
      const normalized = normalizeDalpError(error);
      return { ok: false, authed: normalized.status !== 401, error: normalized };
    }
  },
);

// ===========================================================================
// Mutations — shared with the asset-detail flow: token.transfer + poll, and
// `contacts.list` (filtered client-side) for the recipient autocomplete.
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
      const client = dalpForCurrentRequestWithIdempotency(crypto.randomUUID());
      const result = (await client.dapi.token.transfer({
        params: { tokenAddress: data.tokenAddress },
        body: { transfers: [{ to: data.to, amount: data.amount }] },
      })) as TransferResponse;

      const transactionId = result.data?.id ?? result.data?.transactionId ?? null;
      if (!transactionId) {
        return { kind: "pending" };
      }

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
        return { kind: "compliance_blocked", message: normalized.message, fix: normalized.fix };
      }
      return { kind: "failed", message: normalized.message, fix: normalized.fix };
    }
  });

// The v2 contacts namespace has NO `search` route, so we list the saved
// contacts and filter by the typed query string client-side. UX is unchanged.
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

export const Route = createFileRoute("/transfers")({
  loader: () => loadTransfers(),
  component: TransfersPage,
  pendingComponent: TransfersPending,
});

// ===========================================================================
// Page
// ===========================================================================

function TransfersPage() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const { signOut, signingOut } = useSignOut();
  const [active, setActive] = useState<HoldingView | null>(null);

  if (!result.ok) {
    return (
      <RouteError
        authed={result.authed}
        error={result.error}
        currentPath="/transfers"
        pageTitle="Transfers"
      />
    );
  }

  const { userName, kycStatus, holdings, transfers } = result.data;
  const kycApproved = kycStatus === "approved";

  async function handleTransfer(input: { to: string; amount: string }): Promise<TransferOutcome> {
    if (!active) {
      return { kind: "failed", message: "Pick an asset to transfer first." };
    }
    return submitTransfer({
      data: { tokenAddress: active.tokenAddress, to: input.to, amount: input.amount },
    });
  }

  async function handleSearchContacts(query: string): Promise<ContactSuggestion[]> {
    return searchContacts({ data: { q: query } });
  }

  const transferTarget: TransferTarget | null = active
    ? {
        tokenAddress: active.tokenAddress,
        symbol: active.symbol,
        name: active.name,
        decimals: active.decimals,
        available: active.available,
      }
    : null;

  return (
    <AppShell
      userName={userName ?? undefined}
      kycStatus={kycStatus ?? undefined}
      currentPath="/transfers"
      onSignOut={signOut}
      signingOut={signingOut}
      title="Transfers"
      description="Send a compliant asset to another verified holder, and review your recent transfers."
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => void router.invalidate()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      }
    >
      {!kycApproved ? <KycGate status={kycStatus} /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SendCard
            holdings={holdings}
            kycApproved={kycApproved}
            onPick={(holding) => setActive(holding)}
          />
        </section>
        <section>
          <HistoryCard transfers={transfers} />
        </section>
      </div>

      {transferTarget ? (
        <TransferDialog
          open={active !== null}
          onClose={() => setActive(null)}
          token={transferTarget}
          onTransfer={handleTransfer}
          onSearchContacts={handleSearchContacts}
          onCompleted={() => void router.invalidate()}
        />
      ) : null}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Send: pick a holding to transfer
// ---------------------------------------------------------------------------

interface SendCardProps {
  holdings: HoldingView[];
  kycApproved: boolean;
  onPick: (holding: HoldingView) => void;
}

function SendCard({ holdings, kycApproved, onPick }: SendCardProps) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4 text-neutral-400" aria-hidden="true" />
          Send an asset
        </CardTitle>
        <CardDescription>
          Choose an asset you hold, then enter a recipient and amount.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {holdings.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Nothing to transfer yet"
            description="You don't hold any transferable assets right now. Browse the available assets to get started."
            action={
              <Button asChild variant="brand" size="sm">
                <Link to={TOKENS_TO}>
                  Browse assets
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {holdings.map((holding) => (
              <li key={holding.tokenAddress}>
                <div className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 ring-1 ring-brand-500/15">
                    {holding.symbol.slice(0, 3).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">{holding.name}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {formatDecimalString(holding.available)} {holding.symbol} available
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!kycApproved}
                    onClick={() => onPick(holding)}
                  >
                    <ArrowLeftRight className="size-4" aria-hidden="true" />
                    Send
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// History: recent transfers from user.events
// ---------------------------------------------------------------------------

function HistoryCard({ transfers }: { transfers: ActivityView[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="space-y-1">
        <CardTitle>Recent transfers</CardTitle>
        <CardDescription>Transfers in and out of your account.</CardDescription>
      </CardHeader>
      <CardContent>
        {transfers.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No transfers yet"
            description="Once you send or receive an asset, it will appear here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => (
                <TableRow key={transfer.id}>
                  <TableCell className="font-medium text-neutral-900">
                    {transfer.tokenSymbol ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-neutral-600">
                    {shortenAddress(transfer.counterparty)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {transfer.amount ? formatDecimalString(transfer.amount) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// KYC gate
// ---------------------------------------------------------------------------

function KycGate({ status }: { status: string | null }) {
  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/60">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-amber-200">
            <ShieldCheck className="size-5 text-amber-700" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-neutral-900">KYC required to transfer</p>
              {status ? <StatusBadge status={status} /> : null}
            </div>
            <p className="text-pretty text-sm text-neutral-600">
              Transfers are blocked by each asset's compliance rules until your identity claim is
              approved on-chain.
            </p>
          </div>
        </div>
        <Button asChild variant="brand" size="sm" className="shrink-0">
          <Link to={KYC_TO}>
            Go to KYC
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function TransfersPending() {
  return (
    <AppShell
      currentPath="/transfers"
      title="Transfers"
      description="Send a compliant asset to another verified holder, and review your recent transfers."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-16 w-full rounded-lg" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-44" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
