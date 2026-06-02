import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "~/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "block h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors",
          "placeholder:text-neutral-400",
          "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
          "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500",
          "aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-500 aria-[invalid=true]:focus:ring-red-500",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
