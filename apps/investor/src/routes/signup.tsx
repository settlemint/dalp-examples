import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Select } from "~/components/ui/select";
import { dalpAnonymous, normalizeDalpError } from "~/lib/dalp";

interface SignUpInput {
  email: string;
  password: string;
  name: string;
  country: string;
  province?: string;
}

const signUp = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): SignUpInput => {
    const input = (raw ?? {}) as Partial<Record<keyof SignUpInput, unknown>>;
    const email = String(input.email ?? "").trim();
    const password = String(input.password ?? "");
    const name = String(input.name ?? "").trim();
    const country = String(input.country ?? "").trim();
    const province = String(input.province ?? "").trim();

    if (!email.includes("@")) {
      throw new Error("Enter a valid email address.");
    }
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    if (!name) {
      throw new Error("Name is required.");
    }
    if (!country) {
      throw new Error("Country is required.");
    }
    return province
      ? { email, password, name, country, province }
      : { email, password, name, country };
  })
  .handler(async ({ data }) => {
    try {
      const platform = dalpAnonymous();
      const result = await platform.auth.signUp.email({
        email: data.email,
        password: data.password,
        name: data.name,
        // Better Auth's inferAdditionalFields plugin stores extras on the
        // user profile. `country` + `province` ride along here; the DALP
        // user record carries them after signup.
        country: data.country,
        ...(data.province ? { province: data.province } : {}),
      } as Record<string, unknown>);

      if (result.error) {
        return {
          ok: false as const,
          error: {
            message: result.error.message ?? "Sign-up failed",
            status: result.error.status,
          },
        };
      }

      return { ok: true as const, email: data.email };
    } catch (error) {
      return { ok: false as const, error: normalizeDalpError(error) };
    }
  });

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

const COUNTRIES: { code: string; label: string }[] = [
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
];

interface SignupFormValues {
  name: string;
  email: string;
  password: string;
  country: string;
  province: string;
}

const EMPTY_SIGNUP_VALUES: SignupFormValues = {
  name: "",
  email: "",
  password: "",
  country: "",
  province: "",
};

type SignupFieldErrors = Partial<Record<keyof SignupFormValues, string>>;

/** Inline per-field validation, mirroring the KYC + transfer forms. */
function validateSignup(values: SignupFormValues): SignupFieldErrors {
  const errors: SignupFieldErrors = {};
  if (!values.name.trim()) {
    errors.name = "Enter your full name.";
  }
  if (!values.email.includes("@")) {
    errors.email = "Enter a valid email address.";
  }
  if (values.password.length < 8) {
    errors.password = "Use at least 8 characters.";
  }
  if (!values.country) {
    errors.country = "Select your country.";
  }
  return errors;
}

function SignupPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<SignupFormValues>(EMPTY_SIGNUP_VALUES);
  const [errors, setErrors] = useState<SignupFieldErrors>({});

  function update<K extends keyof SignupFormValues>(key: K, value: SignupFormValues[K]) {
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateSignup(values);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      const result = await signUp({
        data: {
          email: values.email.trim(),
          password: values.password,
          name: values.name.trim(),
          country: values.country,
          province: values.province.trim(),
        },
      });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      navigate({ to: "/verify-email", search: { email: result.email } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <section className="flex items-center justify-center px-6 py-12 lg:py-20">
        <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6" noValidate>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-md bg-brand-500" />
              <span className="text-base font-semibold tracking-tight">Acme Capital</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Create your account</h1>
            <p className="text-sm text-neutral-600">
              Already have one?{" "}
              <Link
                to="/"
                className="font-medium text-brand-700 underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>

          <fieldset disabled={pending} className="space-y-4">
            <Field label="Full name" required error={errors.name}>
              {(control) => (
                <Input
                  {...control}
                  name="name"
                  autoComplete="name"
                  value={values.name}
                  onChange={(event) => update("name", event.target.value)}
                />
              )}
            </Field>
            <Field label="Email" required error={errors.email}>
              {(control) => (
                <Input
                  {...control}
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={(event) => update("email", event.target.value)}
                />
              )}
            </Field>
            <Field label="Password" required error={errors.password} hint="Minimum 8 characters.">
              {(control) => (
                <Input
                  {...control}
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={values.password}
                  onChange={(event) => update("password", event.target.value)}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Country" required error={errors.country}>
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
                    {COUNTRIES.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="State / Province">
                {(control) => (
                  <Input
                    {...control}
                    name="province"
                    autoComplete="address-level1"
                    value={values.province}
                    onChange={(event) => update("province", event.target.value)}
                  />
                )}
              </Field>
            </div>
          </fieldset>

          {error ? (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
            >
              {error}
            </div>
          ) : null}

          <Button type="submit" variant="brand" disabled={pending} className="w-full">
            {pending ? "Creating account…" : "Create account"}
          </Button>

          <p className="text-pretty text-xs text-neutral-500">
            By creating an account you agree to the Acme Capital terms of service and acknowledge
            our privacy notice. KYC is required before holding any compliant asset.
          </p>
        </form>
      </section>

      <aside className="hidden bg-brand-700 text-white lg:flex lg:items-center lg:justify-center lg:px-12">
        <div className="max-w-md space-y-6">
          <div className="text-xs uppercase tracking-widest text-white/70">
            Compliance, built in
          </div>
          <h2 className="text-pretty text-4xl font-semibold leading-tight">
            Hold regulated assets the way regulated institutions do.
          </h2>
          <p className="text-pretty text-base text-white/90">
            One signup. KYC reviewed by the issuer. An on-chain identity claim. Then every transfer
            is checked against the asset's rule engine — automatically, every time.
          </p>
          <ul className="space-y-2 text-sm text-white/90">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 rounded-full bg-white/80" />
              <span>ERC-3643 / SMART compliance with on-chain identity</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 rounded-full bg-white/80" />
              <span>One platform, end to end — no five-vendor stitch-up</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 rounded-full bg-white/80" />
              <span>Atomic DvP settlement, T+0</span>
            </li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
