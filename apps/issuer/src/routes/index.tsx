import { createFileRoute } from "@tanstack/react-router";

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
          Issuer
        </span>
      </div>

      <div className="space-y-3">
        <h1 className="text-balance text-4xl font-semibold tracking-tight">
          Tokenize regulated assets, compliance-first.
        </h1>
        <p className="text-pretty text-lg text-neutral-600">
          A reference issuer portal built on the{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">@settlemint/dalp-sdk</code>
          . Sign up, review investor KYC, design a token, deploy it on-chain.
        </p>
      </div>

      <div className="flex items-center gap-3 text-sm text-neutral-500">
        <span>Port 3000</span>
        <span>·</span>
        <a className="underline hover:text-neutral-900" href="http://localhost:3001">
          Investor portal →
        </a>
      </div>
    </main>
  );
}
