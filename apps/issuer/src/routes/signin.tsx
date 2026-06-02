import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowRight, BadgeCheck, Building2, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { dalpAnonymous, normalizeDalpError } from "~/lib/dalp";
import { forwardSessionCookie } from "~/lib/dalp.server";

interface SignInInput {
  email: string;
  password: string;
}

/** Slice of the Better Auth sign-in result we read. `auth.*` is typed, but the
 * `data` payload itself is `unknown` — annotate the boundary explicitly. */
interface SignInData {
  user?: { id?: string; email?: string };
}

const signIn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): SignInInput => {
    const input = (raw ?? {}) as Partial<Record<keyof SignInInput, unknown>>;
    const email = String(input.email ?? "").trim();
    const password = String(input.password ?? "");
    if (!email.includes("@")) {
      throw new Error("Enter a valid email address.");
    }
    if (password.length === 0) {
      throw new Error("Enter your password.");
    }
    return { email, password };
  })
  .handler(async ({ data }) => {
    try {
      // Anonymous client owns a fresh DalpCookieStore that captures the
      // Set-Cookie Better Auth returns on a successful sign-in.
      const platform = dalpAnonymous();
      const result = await platform.auth.signIn.email({
        email: data.email,
        password: data.password,
      });

      if (result.error) {
        return {
          ok: false as const,
          error: {
            message: result.error.message ?? "Sign-in failed. Check your email and password.",
            status: result.error.status,
          },
        };
      }

      // Forward the captured session cookie to the browser so subsequent
      // requests carry the Better Auth session.
      forwardSessionCookie(platform.cookieStore.header);

      const session = (result.data ?? {}) as SignInData;
      return { ok: true as const, email: session.user?.email ?? data.email };
    } catch (error) {
      return { ok: false as const, error: normalizeDalpError(error) };
    }
  });

export const Route = createFileRoute("/signin")({
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    try {
      const result = await signIn({
        data: {
          email: form.get("email"),
          password: form.get("password"),
        },
      });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      await navigate({ to: "/console" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <section className="flex items-center justify-center px-6 py-12 lg:py-20">
        <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6" noValidate>
          <div className="space-y-2">
            <Link to="/" className="flex items-center gap-2">
              <div className="size-8 rounded-md bg-brand-500" />
              <span className="text-base font-semibold tracking-tight">Acme Capital</span>
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight">Sign in to the console</h1>
            <p className="text-sm text-neutral-600">
              Issuer access for reviewing KYC, designing tokens, and managing holders.
            </p>
          </div>

          <div className="space-y-4">
            <Field label="Email" required>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@issuer.com"
                />
              )}
            </Field>
            <Field label="Password" required>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              )}
            </Field>
          </div>

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
            {pending ? "Signing in…" : "Sign in"}
            {pending ? null : <ArrowRight className="size-4" aria-hidden="true" />}
          </Button>

          <p className="text-xs text-neutral-500">
            This console is restricted to authorized issuer staff. Investor signups happen in the{" "}
            <a
              href="http://localhost:4322"
              className="font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              investor portal
            </a>
            .
          </p>
        </form>
      </section>

      <aside className="hidden bg-brand-700 text-white lg:flex lg:items-center lg:justify-center lg:px-12">
        <div className="max-w-md space-y-6">
          <div className="text-xs uppercase tracking-widest text-white/70">Issuer console</div>
          <h2 className="text-pretty text-4xl font-semibold leading-tight">
            Approve once. Compliance enforces forever.
          </h2>
          <p className="text-pretty text-base text-white/90">
            When you approve an investor's KYC, the platform lands a claim on their on-chain
            identity. From then on every transfer of your asset is checked against its rule engine —
            automatically, every time.
          </p>
          <ul className="space-y-3 text-sm text-white/90">
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-white/80" aria-hidden="true" />
              <span>Review investor KYC and issue on-chain identity claims</span>
            </li>
            <li className="flex items-start gap-2">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-white/80" aria-hidden="true" />
              <span>Design and deploy ERC-3643 / SMART compliant tokens</span>
            </li>
            <li className="flex items-start gap-2">
              <Building2 className="mt-0.5 size-4 shrink-0 text-white/80" aria-hidden="true" />
              <span>One platform, end to end — issuance to settlement</span>
            </li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
