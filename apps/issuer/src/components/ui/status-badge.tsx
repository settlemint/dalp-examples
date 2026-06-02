import { Badge, type BadgeProps } from "./badge";

/**
 * Domain status values that surface across the issuer console — KYC review
 * states and async-transaction states. Mapped to a coherent colour + dot so
 * the same status always reads the same way wherever it appears.
 */
export type StatusValue =
  | "draft"
  | "submitted"
  | "pending"
  | "approved"
  | "completed"
  | "active"
  | "rejected"
  | "failed"
  | "blocked"
  | "changes_requested"
  | "processing"
  | "unknown";

interface StatusMeta {
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
  dot: string;
}

const STATUS_META: Record<StatusValue, StatusMeta> = {
  draft: { label: "Draft", variant: "neutral", dot: "bg-neutral-400" },
  submitted: { label: "Submitted", variant: "info", dot: "bg-sky-500" },
  pending: { label: "Pending", variant: "warning", dot: "bg-amber-500" },
  processing: { label: "Processing", variant: "warning", dot: "bg-amber-500" },
  approved: { label: "Approved", variant: "success", dot: "bg-emerald-500" },
  completed: { label: "Completed", variant: "success", dot: "bg-emerald-500" },
  active: { label: "Active", variant: "success", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", variant: "danger", dot: "bg-red-500" },
  failed: { label: "Failed", variant: "danger", dot: "bg-red-500" },
  blocked: { label: "Blocked", variant: "danger", dot: "bg-red-500" },
  changes_requested: { label: "Changes requested", variant: "warning", dot: "bg-amber-500" },
  unknown: { label: "Unknown", variant: "neutral", dot: "bg-neutral-400" },
};

export interface StatusBadgeProps {
  status: StatusValue | string | null | undefined;
  /** Override the displayed text while keeping the colour mapping. */
  label?: string;
  className?: string;
}

function resolve(status: StatusBadgeProps["status"]): StatusMeta {
  if (status && status in STATUS_META) {
    return STATUS_META[status as StatusValue];
  }
  return STATUS_META.unknown;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const meta = resolve(status);
  return (
    <Badge variant={meta.variant} className={className}>
      <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {label ?? meta.label}
    </Badge>
  );
}
