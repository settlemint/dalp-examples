import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowRight, RefreshCw, SearchX } from "lucide-react";
import { AppShell } from "~/components/app-shell";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Skeleton } from "~/components/ui/skeleton";
import { StatusBadge } from "~/components/ui/status-badge";
import { dalpForCurrentRequest, getIncomingCookie } from "~/lib/dalp";
import { normalizeDalpError } from "~/lib/dalp-errors";
import {
  isPaused,
  tokenAddressOf,
  type LoaderResult,
  type TokenListResponse,
  type TokenView,
  type UserMeResponse,
} from "~/lib/dalp-types";
import { useSignOut } from "~/lib/use-sign-out";
import { RouteError } from "./portfolio";

const PAGE_SIZE = 24;

interface TokensData {
  userName: string | null;
  kycStatus: string | null;
  tokens: TokenView[];
}

type TokensResult = LoaderResult<TokensData>;

// ===========================================================================
// Loader — token.list (browse the compliant registry) + user.me (shell).
// ===========================================================================

const loadTokens = createServerFn({ method: "GET" }).handler(async (): Promise<TokensResult> => {
  if (getIncomingCookie().length === 0) {
    return { ok: false, authed: false, error: { message: "Sign in to browse assets." } };
  }

  try {
    const client = dalpForCurrentRequest();

    const [me, list] = await Promise.all([
      client.dapi.user.me({}) as Promise<UserMeResponse>,
      client.dapi.token.list({
        query: { page: { limit: PAGE_SIZE, offset: 0 } },
      }) as Promise<TokenListResponse>,
    ]);

    if (!me.data) {
      return {
        ok: false,
        authed: false,
        error: { message: "Your session has expired. Sign in again." },
      };
    }

    const tokens: TokenView[] = (list.data ?? []).flatMap((row) => {
      const address = tokenAddressOf(row);
      if (!address) {
        return [];
      }
      return [
        {
          tokenAddress: address,
          name: row.name ?? "Unnamed asset",
          symbol: row.symbol ?? "—",
          decimals: row.decimals ?? 18,
          type: row.type ?? null,
          paused: isPaused(row),
        },
      ];
    });

    return {
      ok: true,
      data: {
        userName: me.data.name ?? me.data.email ?? null,
        kycStatus: me.data.kycStatus ?? null,
        tokens,
      },
    };
  } catch (error) {
    const normalized = normalizeDalpError(error);
    return { ok: false, authed: normalized.status !== 401, error: normalized };
  }
});

export const Route = createFileRoute("/tokens")({
  loader: () => loadTokens(),
  component: TokensPage,
  pendingComponent: TokensPending,
});

// ===========================================================================
// Page
// ===========================================================================

function TokensPage() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const { signOut, signingOut } = useSignOut();

  if (!result.ok) {
    return (
      <RouteError
        authed={result.authed}
        error={result.error}
        currentPath="/tokens"
        pageTitle="Browse assets"
      />
    );
  }

  const { userName, kycStatus, tokens } = result.data;

  return (
    <AppShell
      userName={userName ?? undefined}
      kycStatus={kycStatus ?? undefined}
      currentPath="/tokens"
      onSignOut={signOut}
      signingOut={signingOut}
      title="Browse assets"
      description="Compliant tokens available on the platform. Open one to see its details and your position."
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => void router.invalidate()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      }
    >
      {tokens.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No assets available yet"
          description="There are no compliant assets to browse right now. Check back once an issuer has deployed one."
          className="mt-2"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tokens.map((token) => (
            <TokenCard key={token.tokenAddress} token={token} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function TokenCard({ token }: { token: TokenView }) {
  return (
    <Link
      to="/tokens/$id"
      params={{ id: token.tokenAddress }}
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 ring-1 ring-brand-500/15">
              {token.symbol.slice(0, 3).toUpperCase()}
            </span>
            {token.paused ? (
              <StatusBadge status="blocked" label="Paused" />
            ) : (
              <StatusBadge status="active" label="Tradable" />
            )}
          </div>
          <div className="space-y-1">
            <CardTitle className="truncate">{token.name}</CardTitle>
            <CardDescription className="flex items-center gap-2">
              <span className="font-medium text-neutral-700">{token.symbol}</span>
              {token.type ? <Badge variant="neutral">{token.type}</Badge> : null}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 group-hover:gap-2.5">
            View asset
            <ArrowRight className="size-4 transition-all" aria-hidden="true" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function TokensPending() {
  return (
    <AppShell
      currentPath="/tokens"
      title="Browse assets"
      description="Compliant tokens available on the platform. Open one to see its details and your position."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Card key={index}>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="size-11 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
