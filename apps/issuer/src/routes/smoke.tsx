import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { dalpAdmin, normalizeDalpError } from "~/lib/dalp";

const readSystem = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const result = await dalpAdmin().dapi.system.read({});
    return { ok: true as const, data: result };
  } catch (error) {
    return { ok: false as const, error: normalizeDalpError(error) };
  }
});

export const Route = createFileRoute("/smoke")({
  loader: () => readSystem(),
  component: SmokeRoute,
});

function SmokeRoute() {
  const result = Route.useLoaderData();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">DALP smoke check</h1>
      <p className="text-sm text-neutral-600">
        Calls{" "}
        <code className="rounded bg-neutral-100 px-1.5 py-0.5">client.dapi.system.read()</code> on
        the server. Fill <code className="rounded bg-neutral-100 px-1.5 py-0.5">.env.local</code> to
        make this pass.
      </p>

      {result.ok ? (
        <pre className="overflow-auto rounded-md bg-neutral-50 p-4 text-xs text-neutral-800 ring-1 ring-neutral-200">
          {JSON.stringify(result.data, null, 2)}
        </pre>
      ) : (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-medium">{result.error.message}</div>
          {result.error.why ? <div className="mt-1 text-red-800">{result.error.why}</div> : null}
          {result.error.fix ? <div className="mt-1 text-red-800">{result.error.fix}</div> : null}
          {result.error.errorId ? (
            <div className="mt-2 text-xs text-red-700">id: {result.error.errorId}</div>
          ) : null}
        </div>
      )}
    </main>
  );
}
