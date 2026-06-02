import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "~/lib/utils";

/** Keep a ref pointed at the latest callback so effects can call it without
 * listing it as a dependency (avoids re-binding listeners every render). */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Footer actions (buttons). Rendered in a right-aligned row. */
  footer?: ReactNode;
  /** Prevent close while a mutation is in flight. */
  busy?: boolean;
  className?: string;
}

/**
 * Lightweight modal dialog — no extra dependency. Accessible by construction:
 * role="dialog" + aria-modal, labelled by its title and described by its
 * body, Escape + backdrop to dismiss, focus moved in on open and restored on
 * close, and the page scroll locked while open.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  busy = false,
  className,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Latch the latest onClose without re-running the effect each render.
  const onCloseRef = useLatest(onClose);

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Move focus into the panel (first focusable, else the panel itself).
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onCloseRef.current();
        return;
      }

      // Trap Tab focus inside the panel: collect the panel's focusables and
      // wrap forward (Tab at last -> first) and backward (Shift+Tab at first ->
      // last) so keyboard focus can never escape the open modal.
      if (event.key === "Tab") {
        const container = panelRef.current;
        if (!container) {
          return;
        }
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null || el === container);

        if (focusables.length === 0) {
          // Nothing to land on — keep focus on the panel itself.
          event.preventDefault();
          container.focus();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) {
          return;
        }
        const activeElement = document.activeElement;

        if (event.shiftKey) {
          if (activeElement === first || activeElement === container) {
            event.preventDefault();
            last.focus();
          }
        } else if (activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, busy, onCloseRef]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[1px]" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl outline-none",
          "animate-in fade-in zoom-in-95 duration-150",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-3">
          <div className="space-y-1">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-neutral-900">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-sm text-neutral-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
            className="-mr-1 -mt-1 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:opacity-40"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-1">{children}</div>

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 p-5 pt-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
