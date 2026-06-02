import { KeyRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import type { TokenAction } from "~/lib/tokens";

export interface ActionFormValues {
  pincode: string;
  address: string;
  amount: string;
  currencyCode: string;
}

interface FieldConfig {
  /** Which inputs this action needs, beyond the always-present pincode. */
  address?: { label: string; placeholder: string };
  amount?: { label: string; placeholder: string; hint?: string };
  currency?: boolean;
}

const ACTION_META: Record<
  TokenAction,
  { title: string; description: string; cta: string; pending: string; fields: FieldConfig }
> = {
  mint: {
    title: "Mint tokens",
    description: "Create new supply and credit it to a holder. Async — the supply lands on-chain.",
    cta: "Mint",
    pending: "Minting…",
    fields: {
      address: { label: "Recipient wallet", placeholder: "0x…" },
      amount: { label: "Amount", placeholder: "1000", hint: "In whole tokens." },
    },
  },
  transfer: {
    title: "Transfer tokens",
    description:
      "Move supply from the treasury to a holder. The transfer is checked against compliance.",
    cta: "Transfer",
    pending: "Transferring…",
    fields: {
      address: { label: "Recipient wallet", placeholder: "0x…" },
      amount: { label: "Amount", placeholder: "100", hint: "In whole tokens." },
    },
  },
  freeze: {
    title: "Freeze address",
    description: "Block a wallet from transferring this token until it is unfrozen.",
    cta: "Freeze",
    pending: "Freezing…",
    fields: {
      address: { label: "Wallet to freeze", placeholder: "0x…" },
    },
  },
  pause: {
    title: "Pause token",
    description: "Block all transfers of this token globally until you unpause.",
    cta: "Pause",
    pending: "Pausing…",
    fields: {},
  },
  unpause: {
    title: "Unpause token",
    description: "Resume transfers for this token.",
    cta: "Unpause",
    pending: "Unpausing…",
    fields: {},
  },
  setCap: {
    title: "Set supply cap",
    description: "Update the maximum total supply this token can reach.",
    cta: "Set cap",
    pending: "Updating…",
    fields: {
      amount: {
        label: "New cap",
        placeholder: "10000000",
        hint: "Maximum total supply, in whole tokens.",
      },
    },
  },
  setPrice: {
    title: "Set price",
    description: "Update the unit price used across the platform for this token.",
    cta: "Set price",
    pending: "Updating…",
    fields: {
      amount: { label: "Price", placeholder: "1.00" },
      currency: true,
    },
  },
};

export interface TokenActionDialogProps {
  action: TokenAction | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (values: ActionFormValues) => void;
}

const EMPTY: ActionFormValues = { pincode: "", address: "", amount: "", currencyCode: "USD" };

/** Single dialog that adapts its fields to the selected token action. */
export function TokenActionDialog({ action, busy, onClose, onConfirm }: TokenActionDialogProps) {
  const [values, setValues] = useState<ActionFormValues>(EMPTY);

  // Reset whenever a new action opens.
  useEffect(() => {
    if (action) {
      setValues(EMPTY);
    }
  }, [action]);

  if (!action) {
    return null;
  }

  const meta = ACTION_META[action];
  const fields = meta.fields;

  function set<K extends keyof ActionFormValues>(key: K, value: ActionFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function close() {
    if (busy) {
      return;
    }
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm(values);
  }

  const addressValid = !fields.address || /^0x[a-fA-F0-9]{40}$/.test(values.address.trim());
  const amountValid =
    !fields.amount || (values.amount.trim().length > 0 && Number(values.amount) > 0);
  const currencyValid = !fields.currency || values.currencyCode.trim().length >= 3;
  const pincodeValid = values.pincode.trim().length >= 4;
  const canSubmit = addressValid && amountValid && currencyValid && pincodeValid && !busy;

  return (
    <Dialog
      open
      onClose={close}
      busy={busy}
      title={meta.title}
      description={meta.description}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="token-action-form" variant="brand" disabled={!canSubmit}>
            {busy ? <Spinner label={meta.cta} /> : null}
            {busy ? meta.pending : meta.cta}
          </Button>
        </>
      }
    >
      <form id="token-action-form" onSubmit={handleSubmit} className="space-y-4 pb-1" noValidate>
        {fields.address ? (
          <Field
            label={fields.address.label}
            required
            error={
              values.address.trim().length > 0 && !addressValid
                ? "Enter a valid 0x… address (40 hex characters)."
                : undefined
            }
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                value={values.address}
                onChange={(event) => set("address", event.target.value)}
                disabled={busy}
                placeholder={fields.address?.placeholder}
                className="font-mono"
                autoComplete="off"
              />
            )}
          </Field>
        ) : null}

        {fields.amount ? (
          <Field label={fields.amount.label} required hint={fields.amount.hint}>
            {(controlProps) => (
              <Input
                {...controlProps}
                value={values.amount}
                onChange={(event) => set("amount", event.target.value.replace(/[^\d.]/g, ""))}
                disabled={busy}
                inputMode="decimal"
                placeholder={fields.amount?.placeholder}
              />
            )}
          </Field>
        ) : null}

        {fields.currency ? (
          <Field label="Currency" required hint="3-letter ISO code.">
            {(controlProps) => (
              <Input
                {...controlProps}
                value={values.currencyCode}
                onChange={(event) =>
                  set("currencyCode", event.target.value.toUpperCase().slice(0, 3))
                }
                disabled={busy}
                placeholder="USD"
                className="uppercase"
              />
            )}
          </Field>
        ) : null}

        <Field
          label="Wallet verification code"
          required
          hint="The pincode that authorizes this on-chain action."
        >
          {(controlProps) => (
            <div className="relative">
              <KeyRound
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
                aria-hidden="true"
              />
              <Input
                {...controlProps}
                value={values.pincode}
                onChange={(event) => set("pincode", event.target.value)}
                disabled={busy}
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                className="pl-8 tracking-[0.3em]"
              />
            </div>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
