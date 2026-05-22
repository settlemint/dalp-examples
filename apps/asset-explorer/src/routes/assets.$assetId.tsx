import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useDalp } from "@dalp-examples/dalp-client/react";

export const Route = createFileRoute("/assets/$assetId")({
  component: AssetDetailPage,
});

function AssetDetailPage() {
  const { assetId } = Route.useParams();
  const dalp = useDalp();
  const queryClient = useQueryClient();

  const asset = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => dalp.assets.get(assetId),
  });

  const transfers = useQuery({
    queryKey: ["asset", assetId, "transfers"],
    queryFn: () => dalp.assets.transfers(assetId),
  });

  const transfer = useMutation({
    mutationFn: async (input: { to: string; amount: string }) => {
      const response = await fetch(`${import.meta.env.VITE_DALP_API_URL}/api/assets/${assetId}/transfer`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(import.meta.env.VITE_DALP_API_KEY ? { "x-api-key": import.meta.env.VITE_DALP_API_KEY } : {}),
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Transfer failed (${response.status})`);
      }
      return (await response.json()) as { txHash: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", assetId, "transfers"] });
    },
  });

  const form = useForm({
    defaultValues: { to: "", amount: "" },
    onSubmit: ({ value }) => transfer.mutate(value),
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header>
        <h1 className="font-mono text-2xl font-semibold">{asset.data?.symbol ?? assetId}</h1>
        <p className="text-sm opacity-70">{asset.data?.name ?? "Asset detail"}</p>
      </header>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-brand-100 p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-brand-700">Overview</h2>
          {asset.data ? (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <dt className="opacity-60">Type</dt>
              <dd className="capitalize">{asset.data.type}</dd>
              <dt className="opacity-60">Decimals</dt>
              <dd>{asset.data.decimals}</dd>
              <dt className="opacity-60">Total supply</dt>
              <dd className="font-mono">{asset.data.totalSupply}</dd>
            </dl>
          ) : (
            <p className="mt-3 text-sm">Loading…</p>
          )}
        </div>

        <div className="rounded-lg border border-brand-100 p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-brand-700">Transfer</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              form.handleSubmit();
            }}
          >
            <form.Field name="to">
              {(field) => (
                <label className="block text-sm">
                  <span className="opacity-70">Recipient address</span>
                  <input
                    name={field.name}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="0x…"
                    className="mt-1 w-full rounded border border-brand-100 px-3 py-2 font-mono text-xs"
                  />
                </label>
              )}
            </form.Field>
            <form.Field name="amount">
              {(field) => (
                <label className="block text-sm">
                  <span className="opacity-70">Amount</span>
                  <input
                    name={field.name}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="100"
                    className="mt-1 w-full rounded border border-brand-100 px-3 py-2 font-mono text-xs"
                  />
                </label>
              )}
            </form.Field>
            <button
              type="submit"
              disabled={transfer.isPending}
              className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {transfer.isPending ? "Submitting…" : "Submit transfer"}
            </button>
            {transfer.error ? (
              <p className="text-xs text-danger">
                {transfer.error instanceof Error ? transfer.error.message : "Error"}
              </p>
            ) : null}
            {transfer.data ? (
              <p className="text-xs text-success">
                Tx submitted: <code className="font-mono">{transfer.data.txHash}</code>
              </p>
            ) : null}
          </form>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-brand-700">Recent transfers</h2>
        <table className="mt-3 w-full overflow-hidden rounded-lg border border-brand-100 text-sm">
          <thead className="bg-brand-50 text-left text-xs uppercase text-brand-700">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">From</th>
              <th className="px-4 py-2">To</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(transfers.data ?? []).map((row) => (
              <tr key={row.id} className="border-t border-brand-100">
                <td className="px-4 py-2 font-mono text-xs">{new Date(row.timestamp).toLocaleString()}</td>
                <td className="px-4 py-2 font-mono text-xs">{row.from}</td>
                <td className="px-4 py-2 font-mono text-xs">{row.to}</td>
                <td className="px-4 py-2 text-right font-mono">{row.amount}</td>
              </tr>
            ))}
            {transfers.data && transfers.data.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm opacity-60">
                  No transfers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
