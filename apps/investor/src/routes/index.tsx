import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-8 px-6 py-20">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-md bg-brand-500" />
        <span className="text-lg font-semibold tracking-tight">Acme Capital</span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
          Investor
        </span>
      </div>

      <div className="space-y-3">
        <h1 className="text-balance text-4xl font-semibold tracking-tight">
          Hold and transfer regulated assets, end-to-end.
        </h1>
        <p className="text-pretty text-lg text-neutral-600">
          A reference investor portal built on the{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">@settlemint/dalp-sdk</code>
          . Sign up, submit KYC, browse compliant assets, hold and move tokens.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button asChild variant="brand">
          <Link to="/smoke">Run SDK smoke check</Link>
        </Button>
        <a
          className="text-sm text-neutral-500 underline hover:text-neutral-900"
          href="http://localhost:3000"
        >
          Issuer portal →
        </a>
      </div>

      <div className="text-xs text-neutral-400">Port 3001</div>
    </main>
  );
}
