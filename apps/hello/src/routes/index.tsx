import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useDalp } from "@dalp-examples/dalp-client/react";

export const Route = createFileRoute("/")({
  component: HelloPage,
});

function HelloPage() {
  const dalp = useDalp();
  const { data, isPending, error } = useQuery({
    queryKey: ["whoami"],
    queryFn: () => dalp.whoami(),
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 font-sans">
      <h1 className="text-3xl font-semibold text-brand-700">DALP Hello</h1>
      <p className="mt-2 text-sm opacity-80">
        The smallest example that connects to a DALP instance and reads the current identity.
      </p>

      <section className="mt-8 rounded-lg border border-brand-100 bg-brand-50 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-brand-700">whoami</h2>
        {isPending ? <p className="mt-2 text-sm">Loading…</p> : null}
        {error ? (
          <p className="mt-2 text-sm text-danger">{error instanceof Error ? error.message : "Request failed"}</p>
        ) : null}
        {data ? (
          <pre className="mt-2 overflow-auto rounded bg-white/60 p-3 font-mono text-xs">
            {JSON.stringify(data, null, 2)}
          </pre>
        ) : null}
      </section>

      <footer className="mt-12 text-xs opacity-60">
        Edit <code className="font-mono">src/routes/index.tsx</code> to get started. See the SettleMint docs at{" "}
        <a className="underline" href="https://docs.settlemint.com">
          docs.settlemint.com
        </a>
        .
      </footer>
    </main>
  );
}
