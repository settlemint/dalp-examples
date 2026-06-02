import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "~/lib/utils";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Optional footer actions (buttons) pinned to the bottom. */
  footer?: ReactNode;
  className?: string;
}

/** Selector for the tabbable elements a focus trap must cycle through. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * A small, dependency-free modal dialog. Accessible by construction:
 *   - `role="dialog"` + `aria-modal` + labelled by title / described by body,
 *   - focus moves into the panel on open and restores on close,
 *   - Tab / Shift+Tab are trapped inside the panel (wraps at both ends),
 *   - Escape and backdrop click close it,
 *   - body scroll is locked while open.
 * Used for the transfer flow so the form, async status, and compliance-block
 * state all live in one focused surface.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocus.current = document.activeElement as HTMLElement | null;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    // Move focus into the panel for keyboard + screen-reader users.
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      // Tab focus trap: keep focus inside the panel, wrapping at both ends.
      if (event.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) {
          return;
        }
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((element) => element.offsetParent !== null || element === document.activeElement);
        if (focusable.length === 0) {
          // Nothing tabbable inside — keep focus on the panel itself.
          event.preventDefault();
          panel.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey) {
          if (active === first || active === panel) {
            event.preventDefault();
            last?.focus();
          }
        } else if (active === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-neutral-200 bg-white shadow-xl outline-none sm:rounded-2xl",
          "animate-in fade-in slide-in-from-bottom-4 duration-200",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 p-5">
          <div className="space-y-1">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-neutral-900">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-pretty text-sm text-neutral-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 p-5 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
