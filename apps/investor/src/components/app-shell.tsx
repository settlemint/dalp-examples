import type { ReactNode } from "react";
import { Header, type HeaderProps } from "~/components/header";
import { cn } from "~/lib/utils";

export interface AppShellProps extends HeaderProps {
  children: ReactNode;
  /** Optional page heading rendered above the content. */
  title?: string;
  /** Optional supporting copy under the heading. */
  description?: string;
  /** Optional actions (buttons, links) aligned to the right of the heading. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The frame every authenticated investor route renders inside: sticky Header
 * (brand, nav, KYC status, sign-out) over a centred, max-width content column.
 * Pass the page `title`/`description`/`actions` to get a consistent page header
 * for free. Header-only props (userName, kycStatus, currentPath, onSignOut,
 * signingOut) flow straight through.
 */
export function AppShell({
  children,
  title,
  description,
  actions,
  className,
  ...headerProps
}: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <Header {...headerProps} />
      <main className={cn("mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6", className)}>
        {title ? (
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
              {description ? (
                <p className="text-pretty text-sm text-neutral-500">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
