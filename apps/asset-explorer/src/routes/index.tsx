import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useDalp } from "@dalp-examples/dalp-client/react";

export const Route = createFileRoute("/")({
  component: AssetsListPage,
});

function AssetsListPage() {
  const dalp = useDalp();
  const { data, isPending, error } = useQuery({
    queryKey: ["assets"],
    queryFn: () => dalp.assets.list(),
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Assets</h1>
      <p className="mt-1 text-sm opacity-70">
        Every tokenized asset visible to the current identity.
      </p>

      {isPending ? <p className="mt-6 text-sm">Loading assets…</p> : null}
      {error ? (
        <p className="mt-6 text-sm text-danger">
          {error instanceof Error ? error.message : "Failed to load assets"}
        </p>
      ) : null}

      {data ? (
        <table className="mt-6 w-full overflow-hidden rounded-lg border border-brand-100 text-sm">
          <thead className="bg-brand-50 text-left text-xs uppercase tracking-wide text-brand-700">
            <tr>
              <th className="px-4 py-2">Symbol</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2 text-right">Total supply</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm opacity-60">
                  No assets yet.
                </td>
              </tr>
            ) : null}
            {data.map((asset) => (
              <tr key={asset.id} className="border-t border-brand-100 hover:bg-brand-50/40">
                <td className="px-4 py-3 font-mono">
                  <Link to="/assets/$assetId" params={{ assetId: asset.id }} className="underline">
                    {asset.symbol}
                  </Link>
                </td>
                <td className="px-4 py-3">{asset.name}</td>
                <td className="px-4 py-3 capitalize">{asset.type}</td>
                <td className="px-4 py-3 text-right font-mono">{asset.totalSupply}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </main>
  );
}
