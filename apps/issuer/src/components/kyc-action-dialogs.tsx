import { CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";

/** The reviewable fields an issuer can flag in a "request changes". */
export const REQUESTABLE_FIELDS: { id: string; label: string }[] = [
  { id: "firstName", label: "First name" },
  { id: "lastName", label: "Last name" },
  { id: "dob", label: "Date of birth" },
  { id: "country", label: "Country" },
  { id: "residencyStatus", label: "Residency status" },
  { id: "nationalId", label: "National ID" },
];

interface PincodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

/** Shared wallet-verification (pincode) input used by every action. */
function PincodeField({ value, onChange, disabled, error }: PincodeFieldProps) {
  return (
    <Field
      label="Wallet verification code"
      required
      error={error}
      hint={error ? undefined : "The pincode that authorizes this on-chain action."}
    >
      {(controlProps) => (
        <div className="relative">
          <KeyRound
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
            aria-hidden="true"
          />
          <Input
            {...controlProps}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            className="pl-8 tracking-[0.3em]"
          />
        </div>
      )}
    </Field>
  );
}

/* -------------------------------------------------------------------------- */

export interface ApproveDialogProps {
  open: boolean;
  onClose: () => void;
  investorName: string;
  busy: boolean;
  onConfirm: (input: { pincode: string; reviewNotes: string }) => void;
}

export function ApproveDialog({
  open,
  onClose,
  investorName,
  busy,
  onConfirm,
}: ApproveDialogProps) {
  const [pincode, setPincode] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  function close() {
    if (busy) {
      return;
    }
    setPincode("");
    setReviewNotes("");
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm({ pincode, reviewNotes });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      busy={busy}
      title="Approve KYC"
      description={`Issue an on-chain identity claim for ${investorName}. This unblocks compliant transfers for this holder.`}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="approve-form"
            variant="brand"
            disabled={busy || pincode.length < 4}
          >
            {busy ? (
              <Spinner label="Approving" />
            ) : (
              <CheckCircle2 className="size-4" aria-hidden="true" />
            )}
            {busy ? "Approving…" : "Approve & issue claim"}
          </Button>
        </>
      }
    >
      <form id="approve-form" onSubmit={handleSubmit} className="space-y-4 pb-1" noValidate>
        <PincodeField value={pincode} onChange={setPincode} disabled={busy} />
        <Field label="Review notes" hint="Optional. Stored on the version's audit trail.">
          {(controlProps) => (
            <Textarea
              {...controlProps}
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              disabled={busy}
              placeholder="e.g. Documents verified against the sanctions list."
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

export interface RejectDialogProps {
  open: boolean;
  onClose: () => void;
  investorName: string;
  busy: boolean;
  onConfirm: (input: { pincode: string; rejectionReason: string }) => void;
}

export function RejectDialog({ open, onClose, investorName, busy, onConfirm }: RejectDialogProps) {
  const [pincode, setPincode] = useState("");
  const [reason, setReason] = useState("");
  const reasonTooShort = reason.trim().length > 0 && reason.trim().length < 10;

  function close() {
    if (busy) {
      return;
    }
    setPincode("");
    setReason("");
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm({ pincode, rejectionReason: reason });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      busy={busy}
      title="Reject KYC"
      description={`Decline ${investorName}'s submission. They'll see your reason and can resubmit.`}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="reject-form"
            variant="default"
            disabled={busy || pincode.length < 4 || reason.trim().length < 10}
            className="bg-red-600 hover:bg-red-700"
          >
            {busy ? (
              <Spinner label="Rejecting" />
            ) : (
              <XCircle className="size-4" aria-hidden="true" />
            )}
            {busy ? "Rejecting…" : "Reject submission"}
          </Button>
        </>
      }
    >
      <form id="reject-form" onSubmit={handleSubmit} className="space-y-4 pb-1" noValidate>
        <Field
          label="Rejection reason"
          required
          error={reasonTooShort ? "At least 10 characters." : undefined}
          hint={reasonTooShort ? undefined : "Shown to the investor. Be specific and actionable."}
        >
          {(controlProps) => (
            <Textarea
              {...controlProps}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
              rows={3}
              placeholder="e.g. Proof of address is illegible — re-upload with all four corners visible."
            />
          )}
        </Field>
        <PincodeField value={pincode} onChange={setPincode} disabled={busy} />
      </form>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

export interface RequestUpdateDialogProps {
  open: boolean;
  onClose: () => void;
  investorName: string;
  busy: boolean;
  onConfirm: (input: { pincode: string; reason: string; requiredFields: string[] }) => void;
}

export function RequestUpdateDialog({
  open,
  onClose,
  investorName,
  busy,
  onConfirm,
}: RequestUpdateDialogProps) {
  const [pincode, setPincode] = useState("");
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const reasonTooShort = reason.trim().length > 0 && reason.trim().length < 10;

  function close() {
    if (busy) {
      return;
    }
    setPincode("");
    setReason("");
    setFields([]);
    onClose();
  }

  function toggleField(id: string) {
    setFields((current) =>
      current.includes(id) ? current.filter((f) => f !== id) : [...current, id],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm({ pincode, reason, requiredFields: fields });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      busy={busy}
      title="Request changes"
      description={`Send ${investorName} back a fresh draft with the fields to fix.`}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="request-form"
            variant="default"
            disabled={busy || pincode.length < 4 || reason.trim().length < 10}
          >
            {busy ? <Spinner label="Sending" /> : null}
            {busy ? "Sending…" : "Request changes"}
          </Button>
        </>
      }
    >
      <form id="request-form" onSubmit={handleSubmit} className="space-y-4 pb-1" noValidate>
        <Field
          label="What needs to change?"
          required
          error={reasonTooShort ? "At least 10 characters." : undefined}
          hint={reasonTooShort ? undefined : "Explain what the investor should correct."}
        >
          {(controlProps) => (
            <Textarea
              {...controlProps}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
              rows={3}
              placeholder="e.g. The address on file doesn't match the proof of residence document."
            />
          )}
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-neutral-800">
            Fields to fix <span className="font-normal text-neutral-400">(optional)</span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {REQUESTABLE_FIELDS.map((field) => {
              const checked = fields.includes(field.id);
              return (
                <label
                  key={field.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleField(field.id)}
                    disabled={busy}
                    className="size-4 rounded border-neutral-300 text-brand-500 focus:ring-brand-500"
                  />
                  {field.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <PincodeField value={pincode} onChange={setPincode} disabled={busy} />
      </form>
    </Dialog>
  );
}
