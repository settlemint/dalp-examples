import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeftRight, Coins, LayoutDashboard, LogOut, ShieldCheck, Wallet } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "~/components/ui/button";
import { StatusBadge, type StatusValue } from "~/components/ui/status-badge";
import { BrandMark } from "~/components/brand-mark";
import { cn } from "~/lib/utils";

/**
 * `to` values used by the shell point at routes the later feature slices add.
 * They are not yet in the generated route tree, so the typed `Link` would
 * reject them. We narrow them to the router's own `to` type at the single
 * render boundary — a documented forward reference, not an `any` escape. Once
 * the routes exist this cast becomes a no-op and TanStack starts type-checking
 * the paths for real.
 */
type RouterTo = LinkProps["to"];
function navTo(path: string): RouterTo {
  return path as RouterTo;
}

/**
 * Primary navigation for the authenticated investor portal. `to` values are
 * the route paths the later feature slices add — keep them in sync with the
 * file routes. Typed as a const tuple so the nav is data, not markup.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export const INVESTOR_NAV: readonly NavItem[] = [
  { to: "/portfolio", label: "Portfolio", icon: LayoutDashboard },
  { to: "/tokens", label: "Assets", icon: Coins },
  { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { to: "/kyc", label: "Identity", icon: ShieldCheck },
] as const;

export interface HeaderProps {
  /** Display name of the signed-in user, shown next to the account glyph. */
  userName?: string;
  /**
   * Latest KYC status from `user.kyc.profile.read().latestStatus`. Drives the
   * status pill in the header so the holder always sees where they stand.
   * `null`/`undefined` renders nothing (status not loaded / no profile yet).
   */
  kycStatus?: StatusValue | string | null;
  /** The current pathname, used to mark the active nav item. */
  currentPath?: string;
  /** Invoked when the user clicks "Sign out". */
  onSignOut?: () => void;
  /** True while the sign-out request is in flight. */
  signingOut?: boolean;
}

function isActive(currentPath: string | undefined, to: string): boolean {
  if (!currentPath) {
    return false;
  }
  return currentPath === to || currentPath.startsWith(`${to}/`);
}

/**
 * The application header for authenticated investor routes: brand mark, primary
 * nav, KYC status slot, and a sign-out control. Responsive — the nav collapses
 * to an icon rail on small screens. Rendered by AppShell.
 */
export function Header({
  userName,
  kycStatus,
  currentPath,
  onSignOut,
  signingOut = false,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          to={navTo("/portfolio")}
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <BrandMark showProductTag />
        </Link>

        <nav aria-label="Primary" className="ml-2 flex flex-1 items-center gap-1">
          {INVESTOR_NAV.map((item) => {
            const active = isActive(currentPath, item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={navTo(item.to)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {kycStatus ? (
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <span className="text-xs text-neutral-500">KYC</span>
              <StatusBadge status={kycStatus} />
            </span>
          ) : null}

          <span className="hidden items-center gap-1.5 text-sm text-neutral-700 md:inline-flex">
            <Wallet className="size-4 text-neutral-400" aria-hidden="true" />
            <span className="max-w-[10rem] truncate">{userName ?? "My account"}</span>
          </span>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSignOut}
            disabled={signingOut}
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign out"}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
