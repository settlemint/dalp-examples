import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Activity,
  ArrowDownUp,
  ArrowLeft,
  Ban,
  Coins,
  Copy,
  DollarSign,
  Gauge,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Snowflake,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";
import { useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "~/components/app-shell";
import { TokenActionDialog, type ActionFormValues } from "~/components/token-action-dialog";
import { TokenTxTracker } from "~/components/token-tx-tracker";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { StatusBadge } from "~/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { dalpToast } from "~/lib/dalp";
import { formatTokenAmount, humanize, shortWallet, timeAgo } from "~/lib/format";
import {
  fetchTokenDashboard,
  runTokenAction,
  type TokenAction,
  type TokenDashboard,
  type TokenDashboardResult,
  type TokenHeader,
} from "~/lib/tokens";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/console/tokens/$id")({
  loader: async ({ context, params }) => ({
    issuer: context.issuer,
    result: await fetchTokenDashboard({ data: { tokenAddress: params.id } }),
  }),
  component: TokenDashboardPage,
});

type TabKey = "overview" | "holders" | "activity" | "compliance";

const TABS: { key: TabKey; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "overview", label: "Overview", icon: Gauge },
  { key: "holders", label: "Holders", icon: Users },
  { key: "activity", label: "Activity", icon: Activity },
  { key: "compliance", label: "Compliance", icon: ShieldCheck },
];

function TokenDashboardPage() {
  const { issuer, result } = Route.useLoaderData();
  const { id } = Route.useParams();
  const router = useRouter();

  const [tab, setTab] = useState<TabKey>("overview");
  const [action, setAction] = useState<TokenAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const [txLabel, setTxLabel] = useState<{ title: string; completed: string } | null>(null);

  if (!result.ok) {
    return (
      <AppShell issuer={issuer}>
        <DashboardError result={result} />
      </AppShell>
    );
  }

  const { dashboard } = result;
  const { header } = dashboard;

  async function onConfirm(values: ActionFormValues) {
    if (!action) {
      return;
    }
    setBusy(true);
    try {
      const res = await runTokenAction({
        data: {
          tokenAddress: id,
          action,
          pincode: values.pincode.trim(),
          address: values.address.trim() || undefined,
          amount: values.amount.trim() || undefined,
          currencyCode: values.currencyCode.trim() || undefined,
        },
      });

      if (!res.ok) {
        dalpToast(res.error);
        return;
      }

      const verb = action;
      setAction(null);

      if (res.transactionId) {
        setTxId(res.transactionId);
        setTxLabel(trackerLabel(verb));
        toast.success("Submitted — settling on-chain.");
      } else {
        toast.success(successCopy(verb));
        await router.invalidate();
      }
    } catch (error) {
      dalpToast(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell issuer={issuer}>
      <div className="space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-neutral-500">
            <Link to="/console/tokens">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back to tokens
            </Link>
          </Button>
        </div>

        <DashboardHeader header={header} />

        {dashboard.notices.length > 0 ? (
          <div
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800"
            role="status"
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden="true" />
            <span>{dashboard.notices.join(" ")}</span>
          </div>
        ) : null}

        {txId && txLabel ? (
          <TokenTxTracker
            transactionId={txId}
            title={txLabel.title}
            completedTitle={txLabel.completed}
            steps={[
              {
                phase: "queued",
                label: "Queued",
                description: "Request accepted by the platform.",
              },
              {
                phase: "processing",
                label: "Settling on-chain",
                description: "Writing the state change to the ledger.",
              },
              { phase: "completed", label: "Done", description: "The change is live on-chain." },
            ]}
            onCompleted={() => {
              setTxId(null);
              setTxLabel(null);
              void router.invalidate();
            }}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <StatsRow header={header} dashboard={dashboard} />
            <Tabs tab={tab} onChange={setTab} />
            {tab === "overview" ? (
              <TabPanel tabKey="overview">
                <OverviewTab dashboard={dashboard} header={header} />
              </TabPanel>
            ) : null}
            {tab === "holders" ? (
              <TabPanel tabKey="holders">
                <HoldersTab dashboard={dashboard} header={header} />
              </TabPanel>
            ) : null}
            {tab === "activity" ? (
              <TabPanel tabKey="activity">
                <ActivityTab dashboard={dashboard} />
              </TabPanel>
            ) : null}
            {tab === "compliance" ? (
              <TabPanel tabKey="compliance">
                <ComplianceTab dashboard={dashboard} />
              </TabPanel>
            ) : null}
          </div>

          <ActionPanel
            header={header}
            onSelect={(a) => setAction(a)}
            disabled={busy || txId !== null}
          />
        </div>
      </div>

      <TokenActionDialog
        action={action}
        busy={busy}
        onClose={() => {
          if (!busy) {
            setAction(null);
          }
        }}
        onConfirm={onConfirm}
      />
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */

function trackerLabel(action: TokenAction): { title: string; completed: string } {
  if (action === "mint") {
    return { title: "Minting supply…", completed: "Supply minted" };
  }
  return { title: "Settling transfer…", completed: "Transfer settled" };
}

function successCopy(action: TokenAction): string {
  switch (action) {
    case "freeze":
      return "Address frozen.";
    case "pause":
      return "Token paused — all transfers are blocked.";
    case "unpause":
      return "Token unpaused — transfers resumed.";
    case "setCap":
      return "Supply cap updated.";
    case "setPrice":
      return "Price updated.";
    default:
      return "Done.";
  }
}

function DashboardHeader({ header }: { header: TokenHeader }) {
  function copyAddress() {
    void navigator.clipboard?.writeText(header.id).then(() => toast.success("Address copied."));
  }

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-semibold text-brand-700 ring-1 ring-brand-500/15"
          aria-hidden="true"
        >
          {header.symbol.slice(0, 3)}
        </span>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
              {header.name}
            </h2>
            <Badge variant="neutral">{header.symbol}</Badge>
            {header.type ? <Badge variant="brand">{humanize(header.type)}</Badge> : null}
            <StatusBadge
              status={header.paused ? "blocked" : "active"}
              label={header.paused ? "Paused" : "Active"}
            />
          </div>
          <button
            type="button"
            onClick={copyAddress}
            className="group inline-flex items-center gap-1.5 font-mono text-xs text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            aria-label="Copy token address"
          >
            <Wallet className="size-3.5 text-neutral-400" aria-hidden="true" />
            {shortWallet(header.id)}
            <Copy
              className="size-3 text-neutral-300 group-hover:text-neutral-500"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </header>
  );
}

function StatsRow({ header, dashboard }: { header: TokenHeader; dashboard: TokenDashboard }) {
  const stats: { label: string; value: string; sub?: string }[] = [
    {
      label: "Total supply",
      value: formatTokenAmount(header.totalSupply, header.decimals),
      sub: header.symbol,
    },
    {
      label: "Supply cap",
      value: header.cap ? formatTokenAmount(header.cap, header.decimals) : "No cap",
    },
    {
      label: "Holders",
      value: String(dashboard.distribution.totalHolders),
    },
    {
      label: "Unit price",
      value: header.price?.amount
        ? `${header.price.amount} ${header.price.currency ?? ""}`.trim()
        : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              {stat.label}
            </div>
            <div className="mt-1 truncate font-mono text-lg font-semibold text-neutral-900">
              {stat.value}
            </div>
            {stat.sub ? <div className="text-xs text-neutral-400">{stat.sub}</div> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Tabs({ tab, onChange }: { tab: TabKey; onChange: (tab: TabKey) => void }) {
  // WAI-ARIA APG tablist keyboard pattern: Arrow keys move (and activate, since
  // these tabs use automatic activation), Home/End jump to the ends.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = TABS.findIndex((entry) => entry.key === tab);
    if (currentIndex === -1) {
      return;
    }

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % TABS.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = TABS.length - 1;
        break;
      default:
        return;
    }

    const next = TABS[nextIndex];
    if (!next) {
      return;
    }
    event.preventDefault();
    onChange(next.key);
    // Move DOM focus to the newly selected tab to match the roving tabindex.
    document.getElementById(`tab-${next.key}`)?.focus();
  }

  return (
    <div
      className="flex gap-1 border-b border-neutral-200"
      role="tablist"
      aria-label="Token sections"
      onKeyDown={onKeyDown}
    >
      {TABS.map((entry) => {
        const active = tab === entry.key;
        const Icon = entry.icon;
        return (
          <button
            key={entry.key}
            type="button"
            role="tab"
            id={`tab-${entry.key}`}
            aria-selected={active}
            aria-controls={`panel-${entry.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(entry.key)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              active
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-neutral-500 hover:text-neutral-800",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}

/** Wraps a tab's content in an accessible tabpanel tied back to its tab. */
function TabPanel({ tabKey, children }: { tabKey: TabKey; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`panel-${tabKey}`}
      aria-labelledby={`tab-${tabKey}`}
      tabIndex={0}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-lg"
    >
      {children}
    </div>
  );
}

function OverviewTab({ dashboard, header }: { dashboard: TokenDashboard; header: TokenHeader }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <ArrowDownUp className="size-4 text-brand-700" aria-hidden="true" />
            <CardTitle>Total supply</CardTitle>
          </div>
          <CardDescription>Daily total supply over the last 30 days.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <SupplyChart dashboard={dashboard} header={header} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-brand-700" aria-hidden="true" />
            <CardTitle>Wallet distribution</CardTitle>
          </div>
          <CardDescription>How supply is spread across holders.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          {dashboard.distribution.buckets.length > 0 ? (
            <ul className="space-y-3">
              {dashboard.distribution.buckets.map((bucket) => (
                <li key={bucket.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-700">{bucket.label}</span>
                    <span className="font-medium text-neutral-900">
                      {bucket.count} · {bucket.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.min(100, Math.max(2, bucket.percentage))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">
              No distribution data yet — it appears once the token has holders.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SupplyChart({ dashboard, header }: { dashboard: TokenDashboard; header: TokenHeader }) {
  const points = dashboard.supplyHistory;
  if (points.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No supply history yet — it builds up as you mint and transfer.
      </p>
    );
  }

  const max = Math.max(...points.map((p) => p.totalSupply), 1);
  const latest = points[points.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1" aria-hidden="true">
        {points.map((point, index) => (
          <div
            key={`${point.t}-${index}`}
            className="flex-1 rounded-t bg-brand-500/80"
            style={{ height: `${Math.max(2, (point.totalSupply / max) * 96)}px` }}
            title={`${point.t}: ${point.totalSupply}`}
          />
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        Latest:{" "}
        <span className="font-mono text-neutral-700">
          {formatTokenAmount(latest ? String(latest.totalSupply) : null, 0)}
        </span>{" "}
        {header.symbol} · {points.length} data points
      </p>
    </div>
  );
}

function HoldersTab({ dashboard, header }: { dashboard: TokenDashboard; header: TokenHeader }) {
  if (dashboard.holders.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No holders yet"
        description="Once you mint or transfer supply, holders appear here with their balances and freeze status."
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Holder</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Available</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.holders.map((holder) => (
              <TableRow key={holder.address}>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs text-neutral-700">
                    <Wallet className="size-3.5 text-neutral-400" aria-hidden="true" />
                    {shortWallet(holder.address)}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm text-neutral-700">
                  {formatTokenAmount(holder.balance, header.decimals)}
                </TableCell>
                <TableCell className="font-mono text-sm text-neutral-700">
                  {formatTokenAmount(holder.available, header.decimals)}
                </TableCell>
                <TableCell>
                  {holder.isFrozen ? (
                    <StatusBadge status="blocked" label="Frozen" />
                  ) : (
                    <StatusBadge status="active" label="Active" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ActivityTab({ dashboard }: { dashboard: TokenDashboard }) {
  if (dashboard.events.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Mints, transfers, freezes, and other on-chain events for this token appear here as they happen."
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>From</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Tx</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  <Badge variant="neutral">{humanize(event.eventType)}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-neutral-600">
                  {event.sender ? shortWallet(event.sender) : "—"}
                </TableCell>
                <TableCell className="text-sm text-neutral-600">
                  {timeAgo(event.timestamp)}
                </TableCell>
                <TableCell className="font-mono text-xs text-neutral-500">
                  {event.transactionHash ? shortWallet(event.transactionHash) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ComplianceTab({ dashboard }: { dashboard: TokenDashboard }) {
  if (dashboard.compliance.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No compliance modules attached"
        description="This token does not restrict transfers by compliance. Modules are attached at deploy time."
      />
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-brand-700" aria-hidden="true" />
          <CardTitle>Active compliance modules</CardTitle>
        </div>
        <CardDescription>
          Every transfer of this token is checked against each rule below. A transfer that fails any
          one is blocked with a compliance error.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-5">
        {dashboard.compliance.map((module) => (
          <div
            key={module.typeId}
            className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3"
          >
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-neutral-900">{humanize(module.typeId)}</div>
              {module.address ? (
                <div className="font-mono text-xs text-neutral-500">
                  {shortWallet(module.address)}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface ActionEntry {
  action: TokenAction;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  danger?: boolean;
}

function ActionPanel({
  header,
  onSelect,
  disabled,
}: {
  header: TokenHeader;
  onSelect: (action: TokenAction) => void;
  disabled: boolean;
}) {
  const entries: ActionEntry[] = [
    { action: "mint", label: "Mint", description: "Create new supply", icon: Plus },
    {
      action: "transfer",
      label: "Transfer",
      description: "Move supply to a holder",
      icon: ArrowDownUp,
    },
    { action: "freeze", label: "Freeze address", description: "Block a wallet", icon: Snowflake },
    { action: "setCap", label: "Set cap", description: "Update the supply cap", icon: Gauge },
    {
      action: "setPrice",
      label: "Set price",
      description: "Update the unit price",
      icon: DollarSign,
    },
    header.paused
      ? { action: "unpause", label: "Unpause", description: "Resume all transfers", icon: Play }
      : {
          action: "pause",
          label: "Pause",
          description: "Block all transfers",
          icon: Pause,
          danger: true,
        },
  ];

  return (
    <Card className="h-fit lg:sticky lg:top-6">
      <CardHeader className="border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-brand-700" aria-hidden="true" />
          <CardTitle>Actions</CardTitle>
        </div>
        <CardDescription>
          Each action is authorized with your wallet verification code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-5">
        {entries.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.action}
              type="button"
              onClick={() => onSelect(entry.action)}
              disabled={disabled}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50",
                entry.danger
                  ? "border-red-200 hover:border-red-300 hover:bg-red-50/60"
                  : "border-neutral-200 hover:border-brand-500/40 hover:bg-brand-50/40",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md",
                  entry.danger ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-700",
                )}
                aria-hidden="true"
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-neutral-900">{entry.label}</span>
                <span className="block text-xs text-neutral-500">{entry.description}</span>
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DashboardError({ result }: { result: Extract<TokenDashboardResult, { ok: false }> }) {
  const notFound = result.error.status === 404;
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-neutral-500">
        <Link to="/console/tokens">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to tokens
        </Link>
      </Button>
      <EmptyState
        icon={notFound ? Ban : TriangleAlert}
        title={notFound ? "Token not found" : "Couldn't load this token"}
        description={
          notFound
            ? "It may not exist, may not have finished deploying, or may belong to another organization."
            : result.error.message
        }
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/console/tokens">Return to tokens</Link>
          </Button>
        }
      />
    </div>
  );
}
