import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { readClaimStatus, type ClaimPhase, type ClaimStatus } from "~/lib/kyc";
import { shortWallet } from "~/lib/format";
import { cn } from "~/lib/utils";

/** The ordered steps the claim workflow moves through, for the live tracker. */
const STEPS: { phase: Exclude<ClaimPhase, "failed">; label: string; description: string }[] = [
  { phase: "queued", label: "Approval queued", description: "Request accepted by the platform." },
  {
    phase: "processing",
    label: "Issuing on-chain claim",
    description: "Writing the KYC_APPROVED claim to the holder's OnchainID.",
  },
  {
    phase: "completed",
    label: "Claim issued",
    description: "Compliant transfers are now unblocked for this holder.",
  },
];

const PHASE_ORDER: ClaimPhase[] = ["queued", "processing", "completed"];

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 45; // ~90s ceiling before we surface a "still working" note.

export interface KycClaimTrackerProps {
  transactionId: string;
  /** Called once the claim lands so the parent can refresh the version. */
  onCompleted?: () => void;
}

/**
 * Polls the approval transaction until the KYC_APPROVED claim lands, rendering
 * the live phase progression. Drives a single server-fn call per tick (the
 * poll loop lives here so the UI reacts to each state change). aria-live so
 * the status is announced as it advances.
 */
export function KycClaimTracker({ transactionId, onCompleted }: KycClaimTrackerProps) {
  const [status, setStatus] = useState<ClaimStatus | null>(null);
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
      const next = await readClaimStatus({ data: { transactionId } });
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

  const phase: ClaimPhase = status?.phase ?? "queued";
  const failed = phase === "failed";
  const activeIndex = PHASE_ORDER.indexOf(phase === "failed" ? "processing" : phase);

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
          {failed
            ? "Claim issuance failed"
            : phase === "completed"
              ? "Identity claim issued"
              : "Issuing identity claim…"}
        </h3>
      </div>

      {failed ? (
        <p className="text-sm text-red-800">
          {status?.errorMessage ??
            "The approval transaction did not complete. Refresh and try again, or check the transaction in the platform console."}
        </p>
      ) : (
        <ol className="space-y-3">
          {STEPS.map((step, index) => {
            const reached = activeIndex >= index || phase === "completed";
            const isCurrent = !failed && activeIndex === index && phase !== "completed";
            const isDone = phase === "completed" ? index <= 2 : activeIndex > index;

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
          This is taking longer than usual — the workflow is still running. You can leave this page;
          the claim will land in the background.
        </p>
      ) : null}

      {phase === "completed" ? (
        <div className="mt-4">
          <Button asChild variant="brand" size="sm">
            <Link to="/console/kyc">Back to queue</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
