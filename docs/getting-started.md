# Getting started

## Prerequisites

- [Bun](https://bun.com) at the version pinned in `.bun-version` (currently `1.3.14`).
- Node.js at the version pinned in `.node-version` (currently `24.15.0`) — used for some build tools.
- A running DALP instance you can point examples at (or run DALP locally — see the [DALP repo](https://github.com/settlemint/dalp)).

## Install

```bash
bun install
```

## Configure

Each example has its own `.env.example`. Copy and edit:

```bash
cp apps/hello/.env.example apps/hello/.env.local
```

The two variables every example needs:

- `VITE_DALP_API_URL` — base URL of your DALP `dapi` service.
- `VITE_DALP_API_KEY` — optional API key. Leave blank for passkey-only setups.

## Run

```bash
# everything in parallel
bun run dev

# one example
bun run --filter @dalp-examples/hello dev
bun run --filter @dalp-examples/asset-explorer dev
```

## Build

```bash
bun run build                                       # everything
bun run --filter @dalp-examples/hello build         # one app
```

Output lands in `apps/<name>/dist` (`dist/client/` for the browser bundle, `dist/server/` for the SSR server) — that is what Vercel deploys.

## Quality gates

```bash
bun run lint
bun run typecheck
bun run format
bun run test
```

`bun run ci`-style "all of the above" is what the GitHub Actions workflow runs.
