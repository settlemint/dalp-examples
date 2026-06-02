import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Send, ShieldAlert, TriangleAlert } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { RecipientAutocomplete } from "~/components/recipient-autocomplete";
import { Button } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { StatusBadge } from "~/components/ui/status-badge";
import {
  baseFromDecimalString,
  exceedsBalance,
  formatDecimalString,
  parseAmount,
} from "~/lib/decimal";
import type { ContactSuggestion } from "~/lib/dalp-types";
import { shortenAddress } from "~/lib/dalp-types";

/**
 * The shape the route's transfer server fn returns. `kind` lets the dialog
 * branch cleanly into success / the compliance-block state / a generic error
 * without re-deriving anything client-side.
 */
export type TransferOutcome =
  | { kind: "completed"; transactionHash: string | null }
  | { kind: "pending" } // submitted but still settling past our poll window
  | { kind: "compliance_blocked"; message: string; fix?: string }
  | { kind: "failed"; message: string; fix?: string };

export interface TransferTarget {
  tokenAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Available (transferable) balance as a human-units decimal string. */
  available: string;
}

export interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  token: TransferTarget;
  /** Invoked after a completed transfer so the caller can refresh holdings. */
  onCompleted?: () => void;
  /** Wired to the route's `token.transfer` + poll server fn. */
  onTransfer: (input: { to: string; amount: string }) => Promise<TransferOutcome>;
  /** Wired to the route's `contacts.list` (filtered client-side) server fn. */
  onSearchContacts: (query: string) => Promise<ContactSuggestion[]>;
}

const KYC_TO = "/kyc" as LinkProps["to"];
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

type Phase =
  | { step: "form" }
  | { step: "submitting" }
  | { step: "result"; outcome: TransferOutcome };

/**
 * The compliant-transfer flow. Pick a recipient (contacts autocomplete or a raw
 * address), enter an amount with exact decimal handling, submit. The transfer is
 * async, so the route polls `transaction.read` to completion before resolving.
 *
 * CRUCIAL: a 409 `TRANSFER_BLOCKED_BY_COMPLIANCE` is surfaced as a clear,
 * non-crashing explanation ("your KYC claim hasn't landed yet / the recipient
 * isn't eligible") with a link back to /kyc — never a raw error.
 */
export function TransferDialog({
  open,
  onClose,
  token,
  onCompleted,
  onTransfer,
  onSearchContacts,
}: TransferDialogProps) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "form" });

  const availableBase = useMemo(
    () => baseFromDecimalString(token.available, token.decimals),
    [token.available, token.decimals],
  );

  function reset() {
    setRecipient("");
    setAmount("");
    setRecipientError(null);
    setAmountError(null);
    setPhase({ step: "form" });
  }

  function handleClose() {
    if (phase.step === "submitting") {
      return; // don't allow closing mid-flight
    }
    reset();
    onClose();
  }

  function validate(): { to: string; amount: string } | null {
    let valid = true;
    const to = recipient.trim();
    if (!ADDRESS_RE.test(to)) {
      setRecipientError("Choose a contact or paste a valid 0x wallet address.");
      valid = false;
    } else {
      setRecipientError(null);
    }

    const parsed = parseAmount(amount, token.decimals);
    if (!parsed.ok) {
      setAmountError(parsed.error);
      valid = false;
    } else if (exceedsBalance(parsed.value, availableBase)) {
      setAmountError(
        `You can transfer at most ${formatDecimalString(token.available)} ${token.symbol}.`,
      );
      valid = false;
    } else {
      setAmountError(null);
    }

    if (!valid || !parsed.ok) {
      return null;
    }
    return { to, amount: amount.trim().replace(/,/g, "") };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = validate();
    if (!payload) {
      return;
    }

    setPhase({ step: "submitting" });
    try {
      const outcome = await onTransfer(payload);
      setPhase({ step: "result", outcome });
      if (outcome.kind === "completed") {
        onCompleted?.();
      }
    } catch {
      setPhase({
        step: "result",
        outcome: {
          kind: "failed",
          message: "We couldn't reach the network to send your transfer.",
          fix: "Check your connection and try again.",
        },
      });
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={phase.step === "result" ? "Transfer status" : `Send ${token.symbol}`}
      description={
        phase.step === "form"
          ? `Move ${token.name} to another verified holder. Every transfer is checked against the asset's compliance rules.`
          : undefined
      }
      footer={renderFooter()}
    >
      {phase.step === "result" ? (
        <ResultBody outcome={phase.outcome} token={token} />
      ) : (
        <form id="transfer-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-neutral-500">Available to send</span>
              <span className="font-medium text-neutral-900">
                {formatDecimalString(token.available)} {token.symbol}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="transfer-recipient" className="text-sm font-medium text-neutral-800">
              Recipient
            </label>
            <RecipientAutocomplete
              id="transfer-recipient"
              value={recipient}
              onChange={(wallet) => {
                setRecipient(wallet);
                if (recipientError) {
                  setRecipientError(null);
                }
              }}
              onSearch={onSearchContacts}
              error={recipientError}
              disabled={phase.step === "submitting"}
            />
            {recipient && ADDRESS_RE.test(recipient) ? (
              <p className="font-mono text-xs text-neutral-500">
                Sending to {shortenAddress(recipient)}
              </p>
            ) : null}
            {recipientError ? (
              <p role="alert" className="text-xs text-red-600">
                {recipientError}
              </p>
            ) : null}
          </div>

          <Field label="Amount" required error={amountError ?? undefined}>
            {(control) => (
              <div className="relative">
                <Input
                  {...control}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  className="pr-16"
                  value={amount}
                  disabled={phase.step === "submitting"}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    if (amountError) {
                      setAmountError(null);
                    }
                  }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-neutral-400">
                  {token.symbol}
                </span>
              </div>
            )}
          </Field>
        </form>
      )}
    </Dialog>
  );

  function renderFooter() {
    if (phase.step === "result") {
      const { outcome } = phase;
      if (outcome.kind === "compliance_blocked") {
        return (
          <>
            <Button type="button" variant="outline" onClick={handleClose}>
              Close
            </Button>
            <Button asChild variant="brand">
              <Link to={KYC_TO}>
                Go to KYC
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </>
        );
      }
      if (outcome.kind === "completed" || outcome.kind === "pending") {
        return (
          <Button type="button" variant="brand" onClick={handleClose}>
            Done
          </Button>
        );
      }
      return (
        <>
          <Button type="button" variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button type="button" variant="brand" onClick={() => setPhase({ step: "form" })}>
            Try again
          </Button>
        </>
      );
    }

    return (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={handleClose}
          disabled={phase.step === "submitting"}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          form="transfer-form"
          variant="brand"
          disabled={phase.step === "submitting"}
        >
          {phase.step === "submitting" ? (
            <>
              <Spinner className="text-white" label="Sending transfer" />
              Sending…
            </>
          ) : (
            <>
              <Send className="size-4" aria-hidden="true" />
              Send transfer
            </>
          )}
        </Button>
      </>
    );
  }
}

function ResultBody({ outcome, token }: { outcome: TransferOutcome; token: TransferTarget }) {
  if (outcome.kind === "completed") {
    return (
      <div className="space-y-4" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
            <CheckCircle2 className="size-5 text-emerald-700" aria-hidden="true" />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-neutral-900">Transfer complete</p>
            <StatusBadge status="completed" />
          </div>
        </div>
        <p className="text-pretty text-sm text-neutral-600">
          Your {token.symbol} has been sent and the transfer is confirmed on-chain.
        </p>
        {outcome.transactionHash ? (
          <p className="break-all rounded-md bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-600">
            {outcome.transactionHash}
          </p>
        ) : null}
      </div>
    );
  }

  if (outcome.kind === "pending") {
    return (
      <div className="space-y-4" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200">
            <Spinner className="size-5 text-amber-700" label="Transfer settling" />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-neutral-900">Still confirming</p>
            <StatusBadge status="processing" />
          </div>
        </div>
        <p className="text-pretty text-sm text-neutral-600">
          Your transfer was accepted and is settling on-chain. It's taking a little longer than
          usual — it will appear in your activity feed once it confirms. You don't need to send it
          again.
        </p>
      </div>
    );
  }

  if (outcome.kind === "compliance_blocked") {
    return (
      <div className="space-y-4" aria-live="assertive">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200">
            <ShieldAlert className="size-5 text-amber-700" aria-hidden="true" />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-neutral-900">
              Transfer blocked by compliance
            </p>
            <StatusBadge status="blocked" />
          </div>
        </div>
        <p className="text-pretty text-sm text-neutral-600">
          This asset's rule engine rejected the transfer. The most common reasons:
        </p>
        <ul className="space-y-2 text-sm text-neutral-700">
          <li className="flex items-start gap-2">
            <span
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500"
              aria-hidden="true"
            />
            <span>
              <span className="font-medium text-neutral-900">
                Your KYC claim hasn't landed yet.
              </span>{" "}
              Approval kicks off an on-chain workflow that registers your identity claim — until it
              completes, compliant transfers are blocked.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500"
              aria-hidden="true"
            />
            <span>
              <span className="font-medium text-neutral-900">The recipient isn't eligible.</span>{" "}
              They may not be KYC-verified, or their country / identity isn't allowed to hold this
              asset.
            </span>
          </li>
        </ul>
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {outcome.fix ??
            "Check your KYC status, confirm the recipient is verified, then try again."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-live="assertive">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-red-50 ring-1 ring-red-200">
          <TriangleAlert className="size-5 text-red-700" aria-hidden="true" />
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold text-neutral-900">Transfer failed</p>
          <StatusBadge status="failed" />
        </div>
      </div>
      <p className="text-pretty text-sm text-neutral-600">{outcome.message}</p>
      {outcome.fix ? <p className="text-pretty text-sm text-neutral-500">{outcome.fix}</p> : null}
    </div>
  );
}
