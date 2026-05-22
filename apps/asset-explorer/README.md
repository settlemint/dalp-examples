# DALP Asset Explorer

A focused reference example. Browse tokenized assets, inspect transfer history,
and submit a write action. Demonstrates the full TanStack Start + DALP loop:
typed client, server-rendered queries, mutations with optimistic invalidation,
and a form.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsettlemint%2Fdalp-examples&root-directory=apps%2Fasset-explorer&env=VITE_DALP_API_URL,VITE_DALP_API_KEY&envDescription=DALP%20dapi%20URL%20and%20optional%20API%20key&project-name=dalp-asset-explorer&repository-name=dalp-asset-explorer)

## Stack

- TanStack Start (Vite, SSR)
- TanStack Router, Query, Form, Table
- `@dalp-examples/dalp-client` — typed DALP wrapper
- Tailwind v4 + SettleMint theme

## Run locally

```bash
cp apps/asset-explorer/.env.example apps/asset-explorer/.env.local
bun install
bun run --filter @dalp-examples/asset-explorer dev
```

## Routes

- `/` — list all assets (TanStack Query)
- `/assets/$assetId` — detail page with transfer history (Query) and a
  transfer form (Form + Mutation)

## Where to extend

- Swap the placeholder `dalp-client` for the real oRPC `@dalp/api-contract`
  once it is published.
- Add filters/pagination by lifting the TanStack Query into a route loader and
  using `search` params.
- Add authentication via SettleMint's passkey flow on the root route.
