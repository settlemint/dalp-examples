import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { dalpAdmin, normalizeDalpError } from "~/lib/dalp";

const checkConnection = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await dalpAdmin().dapi.system.read({});
    return { ok: true as const, url: process.env.DALP_API_URL ?? "" };
  } catch (error) {
    return { ok: false as const, error: normalizeDalpError(error) };
  }
});

export const Route = createFileRoute("/")({
  loader: () => checkConnection(),
  component: LandingPage,
});

function LandingPage() {
  const status = Route.useLoaderData();

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

      <ConnectionStatus status={status} />

      <a
        className="text-sm text-neutral-500 underline hover:text-neutral-900"
        href="http://localhost:4321"
      >
        Issuer portal →
      </a>
    </main>
  );
}

type ConnectionStatus = Awaited<ReturnType<typeof checkConnection>>;

function ConnectionStatus({ status }: { status: ConnectionStatus }) {
  if (status.ok) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
        <span className="size-2 rounded-full bg-emerald-500" />
        <span className="font-medium">DALP backend connected</span>
        <code className="text-xs text-emerald-700">{status.url}</code>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
      <div className="flex items-center gap-2 font-medium">
        <span className="size-2 rounded-full bg-amber-500" />
        DALP backend not reachable
      </div>
      <div className="mt-2 text-amber-800">{status.error.message}</div>
      {status.error.why ? <div className="mt-1 text-amber-800">{status.error.why}</div> : null}
      {status.error.fix ? <div className="mt-1 text-amber-800">{status.error.fix}</div> : null}
      <div className="mt-2 text-xs text-amber-700">
        Fill <code className="rounded bg-amber-100 px-1.5 py-0.5">apps/investor/.env.local</code>{" "}
        with
        <code className="rounded bg-amber-100 px-1.5 py-0.5"> DALP_API_URL</code>,
        <code className="rounded bg-amber-100 px-1.5 py-0.5"> DALP_API_KEY</code>,
        <code className="rounded bg-amber-100 px-1.5 py-0.5"> DALP_ORG_ID</code>.
      </div>
    </div>
  );
}
