import { createFileRoute, Link } from "@tanstack/react-router";

interface VerifyEmailSearch {
  email?: string;
}

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>): VerifyEmailSearch => ({
    email: typeof search.email === "string" ? search.email : undefined,
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { email } = Route.useSearch();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <div className="size-12 rounded-full bg-brand-50 ring-1 ring-brand-500/30" />

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
        <p className="text-pretty text-sm text-neutral-600">
          {email ? (
            <>
              We sent a 6-digit code to{" "}
              <span className="font-medium text-neutral-900">{email}</span>.
            </>
          ) : (
            <>We sent a 6-digit code to your inbox.</>
          )}{" "}
          Enter it below to finish signing up.
        </p>
      </div>

      <div className="w-full space-y-3">
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <input
              key={i}
              maxLength={1}
              inputMode="numeric"
              pattern="[0-9]"
              className="h-12 w-10 rounded-md border border-neutral-300 bg-white text-center text-lg font-semibold shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              aria-label={`OTP digit ${i + 1}`}
            />
          ))}
        </div>
        <p className="text-xs text-neutral-500">
          OTP verification is the next slice — this form is a placeholder. The current build creates
          the account; verifying the email and signing in arrive in the next commit.
        </p>
      </div>

      <Link
        to="/"
        className="text-sm text-neutral-500 underline-offset-4 hover:text-neutral-900 hover:underline"
      >
        Back to home
      </Link>
    </main>
  );
}
