import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, Inbox, RefreshCw, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import { useState } from "react";
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
import { fetchKycQueue, type KycQueueResult } from "~/lib/kyc";
import { shortWallet, timeAgo } from "~/lib/format";

export const Route = createFileRoute("/console/kyc/")({
  // Auth is enforced by the parent /console layout's beforeLoad, which also
  // puts `issuer` on the context consumed here.
  loader: async ({ context }) => ({
    issuer: context.issuer,
    queue: await fetchKycQueue(),
  }),
  component: KycQueuePage,
});

function KycQueuePage() {
  const { issuer, queue } = Route.useLoaderData();
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
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
              KYC review queue
            </h2>
            <p className="max-w-2xl text-pretty text-sm text-neutral-600">
              Profiles investors have submitted for review. Approving one issues an on-chain
              identity claim — the moment that unblocks compliant transfers for that holder.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh the review queue"
          >
            <RefreshCw
              className={refreshing ? "size-4 animate-spin" : "size-4"}
              aria-hidden="true"
            />
            Refresh
          </Button>
        </header>

        <QueueBody queue={queue} refreshing={refreshing} />
      </div>
    </AppShell>
  );
}

function QueueBody({ queue, refreshing }: { queue: KycQueueResult; refreshing: boolean }) {
  if (refreshing) {
    return <QueueSkeleton />;
  }

  if (!queue.ok) {
    return (
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">Couldn't load the review queue</p>
              <p className="text-amber-800">{queue.error.message}</p>
              {queue.error.fix ? <p className="text-amber-800">{queue.error.fix}</p> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (queue.entries.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No profiles awaiting review"
        description={`Scanned ${queue.scannedUsers} ${
          queue.scannedUsers === 1 ? "holder" : "holders"
        }. New submissions land here the moment an investor submits their KYC for review.`}
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-brand-700" aria-hidden="true" />
          <CardTitle>Awaiting decision</CardTitle>
        </div>
        <CardDescription>
          {queue.entries.length} {queue.entries.length === 1 ? "submission" : "submissions"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Investor</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="text-right">Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.entries.map((entry) => (
              <TableRow key={entry.versionId}>
                <TableCell>
                  <div className="font-medium text-neutral-900">{entry.userName}</div>
                  <div className="text-xs text-neutral-500">
                    {entry.userEmail ?? "No email on file"}
                  </div>
                </TableCell>
                <TableCell>
                  {entry.wallet ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-neutral-600">
                      <Wallet className="size-3.5 text-neutral-400" aria-hidden="true" />
                      {shortWallet(entry.wallet)}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400">No wallet</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={entry.status} />
                </TableCell>
                <TableCell className="text-sm text-neutral-600">
                  {timeAgo(entry.submittedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link
                      to="/console/kyc/$versionId"
                      params={{ versionId: entry.versionId }}
                      aria-label={`Review ${entry.userName}'s KYC submission`}
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

function QueueSkeleton() {
  return (
    <Card>
      <CardHeader className="border-b border-neutral-100">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3 pt-5">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-center gap-4">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
