import { CheckCircle2, Circle, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { shortWallet } from "~/lib/format";
import { readTokenTxStatus, type TxPhase, type TxStatus } from "~/lib/tokens";
import { cn } from "~/lib/utils";

interface Step {
  phase: Exclude<TxPhase, "failed">;
  label: string;
  description: string;
}

const PHASE_ORDER: TxPhase[] = ["queued", "processing", "completed"];

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 45; // ~90s ceiling before we surface a "still working" note.

export interface TokenTxTrackerProps {
  transactionId: string;
  /** Ordered phase steps tailored to the operation (deploy, mint, transfer). */
  steps: Step[];
  title: string;
  /** Heading shown once the transaction lands. */
  completedTitle: string;
  /** Called once the transaction completes, so the parent can refresh. */
  onCompleted?: () => void;
}

/**
 * Polls a single async token transaction until it lands, rendering the live
 * phase progression. One server-fn call per tick. aria-live announces each
 * step. Shared by the deploy wizard and the dashboard action panel.
 */
export function TokenTxTracker({
  transactionId,
  steps,
  title,
  completedTitle,
  onCompleted,
}: TokenTxTrackerProps) {
  const [status, setStatus] = useState<TxStatus | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const completedRef = useRef(false);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  useEffect(() => {
    let active = true;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      polls += 1;
      const next = await readTokenTxStatus({ data: { transactionId } });
      if (!active) {
        return;
      }
      setStatus(next);

      if (next.phase === "completed") {
        if (!completedRef.current) {
          completedRef.current = true;
          onCompletedRef.current?.();
        }
        return;
      }
      if (next.phase === "failed") {
        return;
      }
      if (polls >= MAX_POLLS) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    }

    void tick();

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [transactionId]);

  const phase: TxPhase = status?.phase ?? "queued";
  const failed = phase === "failed";
  const activeIndex = PHASE_ORDER.indexOf(phase === "failed" ? "processing" : phase);
  const lastIndex = steps.length - 1;

  return (
    <div
      className={cn(
        "rounded-xl border p-5",
        failed ? "border-red-200 bg-red-50/60" : "border-brand-500/20 bg-brand-50/40",
      )}
      aria-live="polite"
    >
      <div className="mb-4 flex items-center gap-2">
        {failed ? (
          <TriangleAlert className="size-4 text-red-600" aria-hidden="true" />
        ) : phase === "completed" ? (
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
        ) : (
          <Loader2 className="size-4 animate-spin text-brand-700" aria-hidden="true" />
        )}
        <h3 className="text-sm font-semibold text-neutral-900">
          {failed ? "Transaction failed" : phase === "completed" ? completedTitle : title}
        </h3>
      </div>

      {failed ? (
        <p className="text-sm text-red-800">
          {status?.errorMessage ??
            "The transaction did not complete. Refresh and try again, or check it in the platform console."}
        </p>
      ) : (
        <ol className="space-y-3">
          {steps.map((step, index) => {
            const reached = activeIndex >= index || phase === "completed";
            const isCurrent = !failed && activeIndex === index && phase !== "completed";
            const isDone = phase === "completed" ? index <= lastIndex : activeIndex > index;

            return (
              <li key={step.phase} className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0" aria-hidden="true">
                  {isDone ? (
                    <CheckCircle2 className="size-5 text-emerald-600" />
                  ) : isCurrent ? (
                    <Loader2 className="size-5 animate-spin text-brand-700" />
                  ) : (
                    <Circle
                      className={cn("size-5", reached ? "text-brand-400" : "text-neutral-300")}
                    />
                  )}
                </span>
                <div>
                  <div
                    className={cn(
                      "text-sm font-medium",
                      isDone
                        ? "text-neutral-900"
                        : isCurrent
                          ? "text-brand-800"
                          : "text-neutral-500",
                    )}
                  >
                    {step.label}
                  </div>
                  <div className="text-xs text-neutral-500">{step.description}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {status?.transactionHash ? (
        <p className="mt-4 font-mono text-xs text-neutral-500">
          tx {shortWallet(status.transactionHash)}
        </p>
      ) : null}

      {timedOut && !failed && phase !== "completed" ? (
        <p className="mt-4 text-xs text-neutral-500">
          This is taking longer than usual — the workflow is still running. It will land in the
          background; you can leave this page.
        </p>
      ) : null}
    </div>
  );
}
