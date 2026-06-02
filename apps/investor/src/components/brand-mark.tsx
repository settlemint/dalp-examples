import { cn } from "~/lib/utils";

export interface BrandMarkProps {
  /** Hide the wordmark and render only the logo glyph. */
  iconOnly?: boolean;
  /** Render the product pill next to the wordmark. */
  showProductTag?: boolean;
  /** Text shown in the product pill. Defaults to "Investor". */
  productTag?: string;
  className?: string;
}

/**
 * Acme Capital logo lockup. A single source of truth for the brand mark so the
 * header, auth pages, and landing all render it identically. The square glyph
 * uses the brand token; swap it for a real SVG when one exists.
 */
export function BrandMark({
  iconOnly = false,
  showProductTag = false,
  productTag = "Investor",
  className,
}: BrandMarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="size-8 rounded-md bg-brand-500" aria-hidden="true" />
      {iconOnly ? (
        <span className="sr-only">Acme Capital</span>
      ) : (
        <span className="text-base font-semibold tracking-tight text-neutral-900">
          Acme Capital
        </span>
      )}
      {showProductTag ? (
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
          {productTag}
        </span>
      ) : null}
    </span>
  );
}
