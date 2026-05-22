export type DalpClientOptions = {
  url: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
};

export type Asset = {
  id: string;
  symbol: string;
  name: string;
  type: "bond" | "equity" | "stablecoin" | "fund" | "deposit";
  totalSupply: string;
  decimals: number;
};

export type Transfer = {
  id: string;
  assetId: string;
  from: string;
  to: string;
  amount: string;
  timestamp: string;
  txHash: string;
};

export type WhoAmI = {
  address: string;
  identity: string | null;
  roles: string[];
};

export type DalpClient = {
  whoami: () => Promise<WhoAmI>;
  assets: {
    list: () => Promise<Asset[]>;
    get: (id: string) => Promise<Asset>;
    transfers: (id: string) => Promise<Transfer[]>;
  };
};

/**
 * Create a DALP client.
 *
 * Replace the fetch URLs with the real DALP endpoints (oRPC contract) once
 * `@dalp/api-contract` is published. For now this is a fetch wrapper that
 * shows the intended call shape.
 */
export function createDalpClient(options: DalpClientOptions): DalpClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const base = options.url.replace(/\/$/, "");

  const request = async <T>(path: string): Promise<T> => {
    const response = await fetchImpl(`${base}${path}`, {
      headers: {
        accept: "application/json",
        ...(options.apiKey ? { "x-api-key": options.apiKey } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`DALP request failed (${response.status}): ${path}`);
    }
    return (await response.json()) as T;
  };

  return {
    whoami: () => request<WhoAmI>("/api/whoami"),
    assets: {
      list: () => request<Asset[]>("/api/assets"),
      get: (id) => request<Asset>(`/api/assets/${encodeURIComponent(id)}`),
      transfers: (id) => request<Transfer[]>(`/api/assets/${encodeURIComponent(id)}/transfers`),
    },
  };
}
