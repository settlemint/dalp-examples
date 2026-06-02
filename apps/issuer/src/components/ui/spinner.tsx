import { Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";

export interface SpinnerProps {
  className?: string;
  /** Accessible label announced to screen readers. */
  label?: string;
}

export function Spinner({ className, label = "Loading" }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite">
      <Loader2 className={cn("size-4 animate-spin text-current", className)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
