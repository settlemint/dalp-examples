import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Optional CTA(s) — e.g. a Button. */
  action?: ReactNode;
  className?: string;
}

/**
 * The canonical "nothing here yet" / "no results" panel. Used for empty
 * lists, empty search results, and gated states so no async screen dead-ends.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="flex size-10 items-center justify-center rounded-full bg-white ring-1 ring-neutral-200">
          <Icon className="size-5 text-neutral-500" aria-hidden="true" />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-neutral-900">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-pretty text-sm text-neutral-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
