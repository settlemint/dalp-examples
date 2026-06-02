import { createFileRoute, Link, type LinkProps, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  ArrowUpRight,
  Coins,
  Inbox,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { AppShell } from "~/components/app-shell";
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
import { dalpForCurrentRequest, getIncomingCookie } from "~/lib/dalp";
import { dalpToast, normalizeDalpError, type NormalizedDalpError } from "~/lib/dalp-errors";
import { formatDecimalString } from "~/lib/decimal";
import {
  eventLabel,
  shortenAddress,
  tokenAddressOf,
  type ActivityView,
  type HoldingView,
  type LoaderResult,
  type UserAssetsResponse,
  type UserEventsResponse,
  type UserMeResponse,
} from "~/lib/dalp-types";
import { useSignOut } from "~/lib/use-sign-out";

// `/tokens/$id` is typed once its route file exists; we keep a single narrowing
// boundary for the dynamic-param link so the holdings table can deep-link.
const TOKENS_TO = "/tokens" as LinkProps["to"];

interface PortfolioData {
  userName: string | null;
  kycStatus: string | null;
  holdings: HoldingView[];
  activity: ActivityView[];
}

type PortfolioResult = LoaderResult<PortfolioData>;

// ===========================================================================
// Loader — user.me (identity + KYC), user.assets (holdings), user.events
// (activity feed). All read through the session-scoped client.
// ===========================================================================

const loadPortfolio = createServerFn({ method: "GET" }).handler(
  async (): Promise<PortfolioResult> => {
    if (getIncomingCookie().length === 0) {
      return { ok: false, authed: false, error: { message: "Sign in to view your portfolio." } };
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
          query: { page: { limit: 15, offset: 0 } },
        }) as Promise<UserEventsResponse>,
      ]);

      const holdings: HoldingView[] = (assets.data ?? []).flatMap((row) => {
        const address = tokenAddressOf(row.token);
        if (!address) {
          return [];
        }
        const decimals = row.token?.decimals ?? 18;
        const balance = row.balance ?? "0";
        return [
          {
            tokenAddress: address,
            name: row.token?.name ?? "Unknown asset",
            symbol: row.token?.symbol ?? "—",
            decimals,
            type: row.token?.type ?? null,
            balance,
            available: row.available ?? balance,
          },
        ];
      });

      const activity: ActivityView[] = (events.data ?? []).map((event, index) => ({
        id: event.id ?? `${event.transactionHash ?? "event"}-${index}`,
        eventType: event.eventType ?? "Activity",
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
          activity,
        },
      };
    } catch (error) {
      const normalized = normalizeDalpError(error);
      return { ok: false, authed: normalized.status !== 401, error: normalized };
    }
  },
);

export const Route = createFileRoute("/portfolio")({
  loader: () => loadPortfolio(),
  component: PortfolioPage,
  pendingComponent: PortfolioPending,
});

// ===========================================================================
// Page
// ===========================================================================

function PortfolioPage() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const { signOut, signingOut } = useSignOut();

  if (!result.ok) {
    return <PortfolioError authed={result.authed} error={result.error} />;
  }

  const { userName, kycStatus, holdings, activity } = result.data;

  return (
    <AppShell
      userName={userName ?? undefined}
      kycStatus={kycStatus ?? undefined}
      currentPath="/portfolio"
      onSignOut={signOut}
      signingOut={signingOut}
      title="Your portfolio"
      description="Everything you hold, and every move on your account."
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void router.invalidate()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button asChild variant="brand" size="sm">
            <Link to={TOKENS_TO}>
              Browse assets
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </>
      }
    >
      {kycStatus !== "approved" ? <KycGateBanner status={kycStatus} /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <HoldingsCard holdings={holdings} />
        </section>
        <section>
          <ActivityCard activity={activity} />
        </section>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

function HoldingsCard({ holdings }: { holdings: HoldingView[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="size-4 text-neutral-400" aria-hidden="true" />
            Holdings
          </CardTitle>
          <CardDescription>
            {holdings.length > 0
              ? `${holdings.length} asset${holdings.length === 1 ? "" : "s"} in your account.`
              : "Compliant assets you hold will appear here."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {holdings.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No holdings yet"
            description="Once you receive or acquire a compliant asset, it will show up here with your balance."
            action={
              <Button asChild variant="brand" size="sm">
                <Link to={TOKENS_TO}>Browse assets</Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="w-10" aria-label="Open asset" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((holding) => (
                <TableRow key={holding.tokenAddress}>
                  <TableCell>
                    <HoldingLink holding={holding} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-neutral-900">
                    {formatDecimalString(holding.balance)} {holding.symbol}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-neutral-600">
                    {formatDecimalString(holding.available)}
                  </TableCell>
                  <TableCell className="text-right">
                    <HoldingChevron holding={holding} />
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

function HoldingLink({ holding }: { holding: HoldingView }) {
  return (
    <Link
      to="/tokens/$id"
      params={{ id: holding.tokenAddress }}
      className="group inline-flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 ring-1 ring-brand-500/15">
        {holding.symbol.slice(0, 3).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-neutral-900 group-hover:text-brand-700">
          {holding.name}
        </span>
        <span className="block truncate text-xs text-neutral-500">
          {holding.symbol}
          {holding.type ? ` · ${holding.type}` : ""}
        </span>
      </span>
    </Link>
  );
}

function HoldingChevron({ holding }: { holding: HoldingView }) {
  return (
    <Link
      to="/tokens/$id"
      params={{ id: holding.tokenAddress }}
      aria-label={`Open ${holding.name}`}
      className="inline-flex size-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <ArrowUpRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

function ActivityCard({ activity }: { activity: ActivityView[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2">
          <Inbox className="size-4 text-neutral-400" aria-hidden="true" />
          Recent activity
        </CardTitle>
        <CardDescription>Transfers, mints, and identity events on your account.</CardDescription>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nothing here yet"
            description="Your account activity — transfers in and out, and identity events — will show up here."
          />
        ) : (
          <ol className="space-y-1">
            {activity.map((event) => (
              <li key={event.id}>
                <ActivityRow event={event} />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityRow({ event }: { event: ActivityView }) {
  return (
    <div className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-neutral-50">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100">
        <ArrowUpRight className="size-4 text-neutral-500" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium text-neutral-900">
            {eventLabel(event.eventType)}
          </p>
          <time className="shrink-0 text-xs text-neutral-400">
            {formatTimestamp(event.timestamp)}
          </time>
        </div>
        <p className="truncate text-xs text-neutral-500">
          {event.amount ? `${formatDecimalString(event.amount)} ` : ""}
          {event.tokenSymbol ?? ""}
          {event.counterparty ? ` · ${shortenAddress(event.counterparty)}` : ""}
        </p>
      </div>
    </div>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Gate banner (KYC not approved yet)
// ---------------------------------------------------------------------------

function KycGateBanner({ status }: { status: string | null }) {
  const KYC_TO = "/kyc" as LinkProps["to"];
  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/60">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-amber-200">
            <ShieldCheck className="size-5 text-amber-700" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-neutral-900">
                Finish KYC to hold and transfer assets
              </p>
              {status ? <StatusBadge status={status} /> : null}
            </div>
            <p className="text-pretty text-sm text-neutral-600">
              Compliant transfers require an approved identity claim. Until then, transfers are
              blocked by the asset's rule engine.
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
// Loading + error states
// ---------------------------------------------------------------------------

function PortfolioPending() {
  return (
    <AppShell
      currentPath="/portfolio"
      title="Your portfolio"
      description="Everything you hold, and every move on your account."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function PortfolioError({ authed, error }: { authed: boolean; error: NormalizedDalpError }) {
  return (
    <RouteError authed={authed} error={error} currentPath="/portfolio" pageTitle="Your portfolio" />
  );
}

// ---------------------------------------------------------------------------
// Shared route-level error surface (also used by /tokens and /tokens/$id).
// ---------------------------------------------------------------------------

export interface RouteErrorProps {
  authed: boolean;
  error: NormalizedDalpError;
  currentPath: string;
  pageTitle: string;
}

export function RouteError({ authed, error, currentPath, pageTitle }: RouteErrorProps) {
  const router = useRouter();
  const { signOut, signingOut } = useSignOut();
  const SIGNUP_TO = "/signup" as LinkProps["to"];

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-20 text-center">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200">
          <ShieldCheck className="size-5 text-amber-700" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Please sign in</h1>
          <p className="text-pretty text-sm text-neutral-600" aria-live="polite">
            {error.message}
          </p>
        </div>
        <Button asChild variant="brand">
          <Link to={SIGNUP_TO}>Go to sign in</Link>
        </Button>
      </main>
    );
  }

  return (
    <AppShell
      currentPath={currentPath}
      onSignOut={signOut}
      signingOut={signingOut}
      title={pageTitle}
    >
      <Card className="max-w-xl">
        <CardHeader className="space-y-2">
          <CardTitle>We couldn't load this page</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {error.fix ? <p className="w-full text-sm text-neutral-500">{error.fix}</p> : null}
          <Button type="button" variant="brand" onClick={() => void router.invalidate()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>
          <Button type="button" variant="outline" onClick={() => dalpToast(error)}>
            Show details
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
