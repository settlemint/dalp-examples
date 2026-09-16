# DALP Examples

Forkable reference apps + an LLM-consumable `SKILL.md` for the [`@settlemint/dalp-sdk`](https://www.npmjs.com/package/@settlemint/dalp-sdk).

Two apps share one critical handshake: investor submits KYC → issuer approves → on-chain identity claim → investor can hold compliant tokens.

```
dalp-examples/
├── SKILL.md          ← the LLM-consumable SDK spec
├── references/       ← per-domain SDK reference docs
├── apps/issuer/      ← localhost:4321
├── apps/investor/    ← localhost:4322
├── examples/         ← headless scripts, one per flow
└── …
```

## Quickstart

```bash
bun install
cp apps/issuer/.env.example apps/issuer/.env.local
cp apps/investor/.env.example apps/investor/.env.local
# fill in DALP_API_URL, DALP_API_KEY, DALP_ORG_ID
bun run dev
```

Open <http://localhost:4321> for the issuer, <http://localhost:4322> for the investor.

On a fresh checkout, both apps show an amber "DALP backend not reachable" connection badge until you fill `.env.local` with `DALP_API_URL`, `DALP_API_KEY`, and `DALP_ORG_ID`.

## Headless examples

`examples/primary-offering/` is one runnable script per flow of a primary
offering, from the bootstrap check through settlement and the register read.
No UI, no framework: each file is a Bun script that calls the SDK and prints
what it did. See [`examples/primary-offering/README.md`](examples/primary-offering/README.md).

```bash
cp examples/primary-offering/.env.example examples/primary-offering/.env
cd examples/primary-offering && bun run flow:01
```

## Stack

- Turborepo + Bun
- TanStack Start (Vite)
- shadcn/ui + Tailwind v4
- `@settlemint/dalp-sdk` via `createDalpPlatformClient`

## Deploy

Cloudflare Pages — see each app's `wrangler.toml`.
