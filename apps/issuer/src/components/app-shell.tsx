import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ShieldCheck, Coins, Users, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

/** The signed-in issuer as surfaced by the route guard (`dapi.user.me`). */
export interface IssuerSession {
  id: string;
  email: string;
  name?: string | null;
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Slices that ship later — rendered disabled so the shell reads complete. */
  upcoming?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/console", label: "Overview", icon: LayoutDashboard },
  { to: "/console/kyc", label: "KYC review", icon: ShieldCheck },
  { to: "/console/tokens", label: "Tokens", icon: Coins },
  { to: "/console/holders", label: "Holders", icon: Users, upcoming: true },
];

export interface AppShellProps {
  issuer: IssuerSession;
  children: ReactNode;
}

export function AppShell({ issuer, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header issuer={issuer} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="flex shrink-0 flex-col gap-1 border-b border-neutral-200 bg-white px-3 py-3 lg:w-60 lg:border-b-0 lg:border-r lg:px-3 lg:py-5">
      <Link to="/" className="mb-2 flex items-center gap-2 px-2 py-1">
        <div className="size-7 rounded-md bg-brand-500" />
        <span className="text-sm font-semibold tracking-tight">Acme Capital</span>
        <Badge variant="brand" className="ml-auto">
          Issuer
        </Badge>
      </Link>

      <nav
        className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
        aria-label="Primary"
      >
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.to || (item.to !== "/console" && pathname.startsWith(`${item.to}/`));
          const Icon = item.icon;

          if (item.upcoming) {
            return (
              <span
                key={item.to}
                aria-disabled="true"
                title="Coming in a later slice"
                className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-neutral-400"
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
                <span className="ml-auto hidden text-[10px] font-normal uppercase tracking-wide text-neutral-300 lg:inline">
                  Soon
                </span>
              </span>
            );
          }

          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function Header({ issuer }: { issuer: IssuerSession }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = NAV_ITEMS.find(
    (item) =>
      pathname === item.to || (item.to !== "/console" && pathname.startsWith(`${item.to}/`)),
  );

  return (
    <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
      <h1 className="text-base font-semibold tracking-tight text-neutral-900">
        {current?.label ?? "Console"}
      </h1>
      <IssuerMenu issuer={issuer} />
    </header>
  );
}

function IssuerMenu({ issuer }: { issuer: IssuerSession }) {
  const displayName = issuer.name?.trim() || issuer.email;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <div className="text-sm font-medium leading-tight text-neutral-900">{displayName}</div>
        <div className="text-xs leading-tight text-neutral-500">{issuer.email}</div>
      </div>
      <div
        className="flex size-8 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white"
        aria-hidden="true"
      >
        {initial}
      </div>
    </div>
  );
}
