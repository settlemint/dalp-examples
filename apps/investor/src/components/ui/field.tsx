import { useId, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Label } from "./label";

export interface FieldProps {
  /** Visible label text. Always rendered and wired to the control via htmlFor. */
  label: string;
  /** The control to render. Receives the generated id + aria-describedby/invalid. */
  children: (controlProps: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
  }) => ReactNode;
  /** Helper text shown under the control when there is no error. */
  hint?: string;
  /** Error text. When present, replaces the hint and marks the control invalid. */
  error?: string;
  /** Adds a subtle required marker to the label. */
  required?: boolean;
  className?: string;
}

/**
 * A labelled form control with hint + error slots. The render-prop hands the
 * caller a generated id (wired to the label) plus aria-describedby / aria-invalid
 * so every control is accessible by construction.
 */
export function Field({ label, children, hint, error, required, className }: FieldProps) {
  const id = useId();
  const describedById = `${id}-description`;
  const message = error ?? hint;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-red-500"> *</span> : null}
      </Label>
      {children({
        id,
        ...(message ? { "aria-describedby": describedById } : {}),
        ...(error ? { "aria-invalid": true } : {}),
      })}
      {message ? (
        <p
          id={describedById}
          className={cn("text-xs", error ? "text-red-600" : "text-neutral-500")}
          {...(error ? { role: "alert" } : {})}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
