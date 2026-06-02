import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeft, MailCheck, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuthLayout } from "~/components/auth-layout";
import { BrandMark } from "~/components/brand-mark";
import { Button } from "~/components/ui/button";
import { OtpInput } from "~/components/ui/otp-input";
import { Spinner } from "~/components/ui/spinner";
// Server-only helpers — used exclusively inside `.handler()` bodies, which
// TanStack extracts into a server chunk, so they never reach the browser.
import { dalpAnonymous, forwardSessionCookie } from "~/lib/dalp";
// Client-safe error helpers — used in the component, so imported from the
// module with no server-only imports (avoids a client/server boundary error).
import { dalpToast, normalizeDalpError } from "~/lib/dalp-errors";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

interface VerifyEmailSearch {
  email?: string;
}

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>): VerifyEmailSearch => ({
    email: typeof search.email === "string" ? search.email : undefined,
  }),
  component: VerifyEmailPage,
});

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

interface VerifyOtpInput {
  email: string;
  otp: string;
}

/**
 * Verify the 6-digit email OTP through the TYPED Better Auth surface.
 *
 * `auth.signIn.emailOtp({ email, otp })` resolves via the `signIn` Record index
 * (SDK ground truth: `signIn: Record<string, DalpAuthOperation> & { email }`),
 * maps to Better Auth's `POST /sign-in/email-otp`, and returns a fresh session.
 * The anonymous client owns a cookie store that captures the Set-Cookie Better
 * Auth emits on success; `forwardSessionCookie` writes it to the response so the
 * session sticks in the browser for every subsequent request.
 */
const verifyEmailOtp = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): VerifyOtpInput => {
    const input = (raw ?? {}) as Partial<Record<keyof VerifyOtpInput, unknown>>;
    const email = String(input.email ?? "").trim();
    const otp = String(input.otp ?? "").replace(/\D/g, "");

    if (!email.includes("@")) {
      throw new Error("Enter the email address you signed up with.");
    }
    if (otp.length !== OTP_LENGTH) {
      throw new Error(`Enter the ${OTP_LENGTH}-digit code from your email.`);
    }
    return { email, otp };
  })
  .handler(async ({ data }) => {
    try {
      const platform = dalpAnonymous();
      // `signIn` is `Record<string, Op> & { email }`; `emailOtp` resolves via
      // the Record index. Under noUncheckedIndexedAccess that index is
      // `Op | undefined`, so we narrow it before calling — still fully typed,
      // no `any`.
      const signInEmailOtp = platform.auth.signIn.emailOtp;
      if (!signInEmailOtp) {
        return {
          ok: false as const,
          error: { message: "Email verification is unavailable right now." },
        };
      }

      const result = await signInEmailOtp({
        email: data.email,
        otp: data.otp,
      });

      if (result.error) {
        return {
          ok: false as const,
          error: {
            message: result.error.message ?? "That code didn't work. Please try again.",
            code: result.error.code,
            status: result.error.status,
          },
        };
      }

      // Persist the rotated session cookie back to the browser. After this the
      // browser carries the Better Auth session on every subsequent request.
      forwardSessionCookie(platform);

      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: normalizeDalpError(error) };
    }
  });

interface ResendOtpInput {
  email: string;
}

interface SendOtpResponse {
  success?: boolean;
}

/**
 * Re-send the verification OTP. There is no top-level `auth.emailOtp` key on the
 * typed surface, so we use the documented `auth.$fetch` escape hatch to hit
 * Better Auth's `POST /email-otp/send-verification-otp` (type `"sign-in"`). The
 * route is untyped, so we annotate the response shape explicitly.
 */
const resendEmailOtp = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): ResendOtpInput => {
    const input = (raw ?? {}) as Partial<Record<keyof ResendOtpInput, unknown>>;
    const email = String(input.email ?? "").trim();
    if (!email.includes("@")) {
      throw new Error("We need a valid email address to resend the code.");
    }
    return { email };
  })
  .handler(async ({ data }) => {
    try {
      const platform = dalpAnonymous();
      const response = (await platform.auth.$fetch("/email-otp/send-verification-otp", {
        method: "POST",
        body: { email: data.email, type: "sign-in" },
      })) as SendOtpResponse;

      return { ok: true as const, success: response?.success ?? true };
    } catch (error) {
      return { ok: false as const, error: normalizeDalpError(error) };
    }
  });

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function VerifyEmailPage() {
  const { email } = Route.useSearch();
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Count the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  // Guard against a state update after the component unmounts mid-request.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function submit(value: string) {
    if (!email) {
      setError("We lost track of your email. Head back and sign up again.");
      return;
    }
    if (value.length !== OTP_LENGTH || verifying) {
      return;
    }

    setVerifying(true);
    setError(null);
    try {
      const result = await verifyEmailOtp({ data: { email, otp: value } });
      if (!result.ok) {
        setError(result.error.message);
        setCode("");
        return;
      }
      await navigate({ to: "/kyc" });
    } catch (err) {
      setError(normalizeDalpError(err).message);
      dalpToast(err);
    } finally {
      if (mounted.current) {
        setVerifying(false);
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(code);
  }

  async function handleResend() {
    if (!email || resending || cooldown > 0) {
      return;
    }
    setResending(true);
    setError(null);
    try {
      const result = await resendEmailOtp({ data: { email } });
      if (!result.ok) {
        dalpToast(result.error);
        return;
      }
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      dalpToast(err);
    } finally {
      if (mounted.current) {
        setResending(false);
      }
    }
  }

  const canSubmit = code.length === OTP_LENGTH && !verifying;

  return (
    <AuthLayout>
      <div className="space-y-8">
        <div className="space-y-4">
          <Link
            to="/signup"
            className="inline-flex items-center gap-1.5 text-sm text-neutral-500 underline-offset-4 hover:text-neutral-900 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to sign up
          </Link>

          <BrandMark />

          <div className="space-y-2">
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-brand-50 ring-1 ring-brand-500/20">
              <MailCheck className="size-5 text-brand-700" aria-hidden="true" />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight">Verify your email</h1>
            <p className="text-pretty text-sm text-neutral-600">
              {email ? (
                <>
                  We sent a {OTP_LENGTH}-digit code to{" "}
                  <span className="font-medium text-neutral-900">{email}</span>. Enter it below to
                  confirm your address and sign in.
                </>
              ) : (
                <>
                  We sent a {OTP_LENGTH}-digit code to your inbox. Enter it below to confirm your
                  address and sign in.
                </>
              )}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <span id="otp-label" className="block text-sm font-medium text-neutral-800">
              Verification code
            </span>
            <OtpInput
              value={code}
              onChange={(next) => {
                setCode(next);
                if (error) {
                  setError(null);
                }
              }}
              onComplete={(full) => void submit(full)}
              length={OTP_LENGTH}
              disabled={verifying}
              invalid={Boolean(error)}
              autoFocus
              aria-label="Email verification code"
              aria-describedby="otp-status"
            />
            <p
              id="otp-status"
              {...(error ? { role: "alert" } : {})}
              aria-live="polite"
              className={error ? "text-xs text-red-600" : "text-xs text-neutral-500"}
            >
              {error ?? "Paste the whole code or type it digit by digit."}
            </p>
          </div>

          <Button type="submit" variant="brand" disabled={!canSubmit} className="w-full">
            {verifying ? (
              <>
                <Spinner className="text-white" label="Verifying code" />
                Verifying…
              </>
            ) : (
              <>
                <ShieldCheck className="size-4" aria-hidden="true" />
                Verify and continue
              </>
            )}
          </Button>
        </form>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-5 text-sm">
          <span className="text-neutral-500">Didn&apos;t get the code?</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleResend()}
            disabled={resending || cooldown > 0 || !email}
          >
            {resending ? (
              <>
                <Spinner label="Resending code" />
                Resending…
              </>
            ) : cooldown > 0 ? (
              `Resend in ${cooldown}s`
            ) : (
              "Resend code"
            )}
          </Button>
        </div>

        <p className="text-pretty text-xs text-neutral-500">
          Check your spam folder if it&apos;s not in your inbox. Codes expire after a few minutes —
          resend a fresh one if yours has lapsed.
        </p>
      </div>
    </AuthLayout>
  );
}
