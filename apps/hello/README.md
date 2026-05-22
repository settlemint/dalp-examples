# DALP Hello

The smallest working DALP example. One page, one query: connect to a DALP
instance and render the current identity.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsettlemint%2Fdalp-examples&root-directory=apps%2Fhello&env=VITE_DALP_API_URL,VITE_DALP_API_KEY&envDescription=DALP%20dapi%20URL%20and%20optional%20API%20key&project-name=dalp-hello&repository-name=dalp-hello)

## Stack

- TanStack Start (Vite, SSR)
- TanStack Router + TanStack Query
- `@dalp-examples/dalp-client` — typed DALP wrapper
- Tailwind v4 + SettleMint theme

## Run locally

```bash
cp apps/hello/.env.example apps/hello/.env.local
# edit VITE_DALP_API_URL to point at a running DALP dapi

bun install
bun run --filter @dalp-examples/hello dev
```

## What to look at

- `src/routes/__root.tsx` — wires `<DalpProvider>` so every route can call DALP.
- `src/routes/index.tsx` — a single TanStack Query against `dalp.whoami()`.

That is the whole example. Extend from here.
