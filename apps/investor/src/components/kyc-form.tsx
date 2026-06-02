import { useMemo, useState, type FormEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Select } from "~/components/ui/select";

/**
 * The KYC field set the investor fills in. Sourced from the REAL oRPC contract
 * for `user.kyc.version.update` / `versions.create` (mined from the SDK bundle,
 * verified against the issuer review app): firstName, lastName, dob (ISO date),
 * country (ISO code), residencyStatus, nationalId. The reference docs paraphrase
 * these wrong (fullName/dateOfBirth/countryCode/nationality/address…) — those
 * fields do NOT exist on the version, so they are intentionally absent here.
 * Document upload is explicitly out of scope for v1 — fields only.
 */
export type ResidencyStatus = "resident" | "non_resident" | "dual_resident" | "unknown";

export interface KycFormValues {
  firstName: string;
  lastName: string;
  dob: string;
  country: string;
  residencyStatus: ResidencyStatus | "";
  nationalId: string;
}

export const EMPTY_KYC_VALUES: KycFormValues = {
  firstName: "",
  lastName: "",
  dob: "",
  country: "",
  residencyStatus: "",
  nationalId: "",
};

/**
 * ISO 3166-1 alpha-2 country options for the country-of-residence select. Kept
 * small + ordered like the signup form's country list so the two screens read
 * as one product.
 */
export const KYC_COUNTRIES: readonly { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "BE", label: "Belgium" },
  { code: "CH", label: "Switzerland" },
  { code: "IE", label: "Ireland" },
  { code: "JP", label: "Japan" },
  { code: "SG", label: "Singapore" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "HK", label: "Hong Kong SAR" },
  { code: "AU", label: "Australia" },
  { code: "CA", label: "Canada" },
] as const;

/** Residency-status options — the contract's `residencyStatus` enum. */
export const RESIDENCY_OPTIONS: readonly { value: ResidencyStatus; label: string }[] = [
  { value: "resident", label: "Resident" },
  { value: "non_resident", label: "Non-resident" },
  { value: "dual_resident", label: "Dual resident" },
  { value: "unknown", label: "Prefer not to say" },
] as const;

/** Per-field validation messages, keyed by field name. */
export type KycFieldErrors = Partial<Record<keyof KycFormValues, string>>;

/**
 * Client-side validation mirroring the server's required-field set. Returns a
 * map of field → message; an empty map means the form is submittable. The
 * server re-validates (`KYC_VALIDATION_FAILED`), so this is purely for fast,
 * inline feedback.
 */
export function validateKyc(values: KycFormValues): KycFieldErrors {
  const errors: KycFieldErrors = {};
  if (!values.firstName.trim()) {
    errors.firstName = "Enter your legal first name.";
  }
  if (!values.lastName.trim()) {
    errors.lastName = "Enter your legal last name.";
  }
  if (!values.dob) {
    errors.dob = "Enter your date of birth.";
  } else if (Number.isNaN(Date.parse(values.dob))) {
    errors.dob = "Enter a valid date.";
  }
  if (!values.country) {
    errors.country = "Select your country of residence.";
  }
  if (!values.residencyStatus) {
    errors.residencyStatus = "Select your residency status.";
  }
  if (!values.nationalId.trim()) {
    errors.nationalId = "Enter your national ID number.";
  }
  return errors;
}

export interface KycFormProps {
  /** Initial field values (prefill from an existing draft). */
  defaultValues?: KycFormValues;
  /**
   * Field names the issuer asked the investor to revisit (from
   * `requestUpdate`). Highlighted inline so the investor knows exactly what to
   * fix.
   */
  highlightFields?: readonly (keyof KycFormValues)[];
  /** True while a submit request is in flight — disables the form. */
  submitting?: boolean;
  /** Submit-time error to surface above the actions (server-side failure). */
  formError?: string | null;
  /** Label for the primary submit button. */
  submitLabel?: string;
  /** Called with validated values when the form is submitted. */
  onSubmit: (values: KycFormValues) => void;
}

/**
 * The investor KYC field form. Controlled, fully labelled, keyboard-friendly,
 * and accessible by construction (every control is wired to a <label> via the
 * Field render-prop). Validates on submit and surfaces both inline field
 * errors and a top-level server error with aria-live.
 */
export function KycForm({
  defaultValues = EMPTY_KYC_VALUES,
  highlightFields,
  submitting = false,
  formError,
  submitLabel = "Submit for review",
  onSubmit,
}: KycFormProps) {
  const [values, setValues] = useState<KycFormValues>(defaultValues);
  const [errors, setErrors] = useState<KycFieldErrors>({});

  const highlighted = useMemo(
    () => new Set<keyof KycFormValues>(highlightFields ?? []),
    [highlightFields],
  );

  function update<K extends keyof KycFormValues>(key: K, value: KycFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateKyc(values);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }
    onSubmit({
      ...values,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      nationalId: values.nationalId.trim(),
    });
  }

  function hint(field: keyof KycFormValues, base?: string): string | undefined {
    return highlighted.has(field) ? "The issuer asked you to revisit this." : base;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      <fieldset disabled={submitting} className="space-y-8">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900">Personal details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required error={errors.firstName} hint={hint("firstName")}>
              {(control) => (
                <Input
                  {...control}
                  name="firstName"
                  autoComplete="given-name"
                  placeholder="Ada"
                  value={values.firstName}
                  onChange={(event) => update("firstName", event.target.value)}
                />
              )}
            </Field>

            <Field label="Last name" required error={errors.lastName} hint={hint("lastName")}>
              {(control) => (
                <Input
                  {...control}
                  name="lastName"
                  autoComplete="family-name"
                  placeholder="Lovelace"
                  value={values.lastName}
                  onChange={(event) => update("lastName", event.target.value)}
                />
              )}
            </Field>

            <Field label="Date of birth" required error={errors.dob} hint={hint("dob")}>
              {(control) => (
                <Input
                  {...control}
                  name="dob"
                  type="date"
                  autoComplete="bday"
                  value={values.dob}
                  onChange={(event) => update("dob", event.target.value)}
                />
              )}
            </Field>

            <Field
              label="National ID"
              required
              error={errors.nationalId}
              hint={hint("nationalId", "Passport or national identity number.")}
            >
              {(control) => (
                <Input
                  {...control}
                  name="nationalId"
                  autoComplete="off"
                  placeholder="e.g. passport number"
                  value={values.nationalId}
                  onChange={(event) => update("nationalId", event.target.value)}
                />
              )}
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900">Residency</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Country of residence"
              required
              error={errors.country}
              hint={hint("country")}
            >
              {(control) => (
                <Select
                  {...control}
                  name="country"
                  value={values.country}
                  onChange={(event) => update("country", event.target.value)}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {KYC_COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label="Residency status"
              required
              error={errors.residencyStatus}
              hint={hint("residencyStatus")}
            >
              {(control) => (
                <Select
                  {...control}
                  name="residencyStatus"
                  value={values.residencyStatus}
                  onChange={(event) =>
                    update("residencyStatus", event.target.value as ResidencyStatus | "")
                  }
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {RESIDENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </section>
      </fieldset>

      {formError ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
        >
          {formError}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-neutral-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-neutral-500">
          You can come back and edit your details any time before the issuer reviews them.
        </p>
        <Button type="submit" variant="brand" disabled={submitting} className="sm:w-auto">
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Submitting…
            </>
          ) : (
            <>
              <Send className="size-4" aria-hidden="true" />
              {submitLabel}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
