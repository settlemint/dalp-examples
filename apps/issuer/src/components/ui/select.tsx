import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "~/lib/utils";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Native <select> styled to match the Input. Native is deliberate: it is the
 * most accessible, keyboard-friendly, mobile-friendly option and needs no
 * extra ARIA wiring.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "block h-9 w-full appearance-none rounded-md border border-neutral-300 bg-white px-3 py-2 pr-9 text-sm shadow-sm transition-colors",
            "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
            "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500",
            "aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-500 aria-[invalid=true]:focus:ring-red-500",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
          aria-hidden="true"
        />
      </div>
    );
  },
);
Select.displayName = "Select";
