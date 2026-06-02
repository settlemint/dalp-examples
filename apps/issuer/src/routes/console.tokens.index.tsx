import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, Coins, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { AppShell } from "~/components/app-shell";
import { Badge } from "~/components/ui/badge";
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
import { formatDate, formatTokenAmount, humanize, shortWallet } from "~/lib/format";
import { fetchTokens, type TokenListResult } from "~/lib/tokens";

export const Route = createFileRoute("/console/tokens/")({
  // Auth is enforced by the parent /console layout's beforeLoad, which also
  // puts `issuer` on the context consumed here.
  loader: async ({ context }) => ({
    issuer: context.issuer,
    result: await fetchTokens(),
  }),
  component: TokensIndexPage,
});

function TokensIndexPage() {
  const { issuer, result } = Route.useLoaderData();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <AppShell issuer={issuer}>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Tokens</h2>
            <p className="max-w-2xl text-pretty text-sm text-neutral-600">
              The compliant assets your organization has deployed. Every transfer of each token is
              checked against the compliance modules attached at deploy time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh the token list"
            >
              <RefreshCw
                className={refreshing ? "size-4 animate-spin" : "size-4"}
                aria-hidden="true"
              />
              Refresh
            </Button>
            <Button asChild variant="brand" size="sm">
              <Link to="/console/tokens/new">
                <Plus className="size-4" aria-hidden="true" />
                New token
              </Link>
            </Button>
          </div>
        </header>

        <TokensBody result={result} refreshing={refreshing} />
      </div>
    </AppShell>
  );
}

function TokensBody({ result, refreshing }: { result: TokenListResult; refreshing: boolean }) {
  if (refreshing) {
    return <TokensSkeleton />;
  }

  if (!result.ok) {
    return (
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">Couldn't load your tokens</p>
              <p className="text-amber-800">{result.error.message}</p>
              {result.error.fix ? <p className="text-amber-800">{result.error.fix}</p> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (result.tokens.length === 0) {
    return (
      <EmptyState
        icon={Coins}
        title="No tokens yet"
        description="Deploy your first compliant asset — choose a type, set its parameters, and attach the compliance modules that gate every transfer."
        action={
          <Button asChild variant="brand" size="sm">
            <Link to="/console/tokens/new">
              <Plus className="size-4" aria-hidden="true" />
              Deploy a token
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-brand-700" aria-hidden="true" />
          <CardTitle>Deployed assets</CardTitle>
        </div>
        <CardDescription>
          {result.tokens.length} {result.tokens.length === 1 ? "token" : "tokens"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Total supply</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Deployed</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.tokens.map((token) => (
              <TableRow key={token.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700 ring-1 ring-brand-500/15"
                      aria-hidden="true"
                    >
                      {token.symbol.slice(0, 3)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-neutral-900">{token.name}</div>
                      <div className="font-mono text-xs text-neutral-500">
                        {token.symbol} · {shortWallet(token.id)}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="neutral">{humanize(token.type)}</Badge>
                </TableCell>
                <TableCell className="font-mono text-sm text-neutral-700">
                  {formatTokenAmount(token.totalSupply, token.decimals)}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={token.paused ? "blocked" : "active"}
                    label={token.paused ? "Paused" : "Active"}
                  />
                </TableCell>
                <TableCell className="text-sm text-neutral-600">
                  {formatDate(token.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link
                      to="/console/tokens/$id"
                      params={{ id: token.id }}
                      aria-label={`Open the ${token.name} dashboard`}
                    >
                      Open
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TokensSkeleton() {
  return (
    <Card>
      <CardHeader className="border-b border-neutral-100">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3 pt-5">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-center gap-4">
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
