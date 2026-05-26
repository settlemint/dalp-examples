# DALP Examples

Forkable reference apps + an LLM-consumable `SKILL.md` for the [`@settlemint/dalp-sdk`](https://www.npmjs.com/package/@settlemint/dalp-sdk).

Two apps share one critical handshake: investor submits KYC → issuer approves → on-chain identity claim → investor can hold compliant tokens.

```
dalp-examples/
├── SKILL.md          ← the LLM-consumable SDK spec
├── apps/issuer/      ← localhost:3000
├── apps/investor/    ← localhost:3001
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

Open <http://localhost:3000> for the issuer, <http://localhost:3001> for the investor.

## Stack

- Turborepo + Bun
- TanStack Start (Vite)
- shadcn/ui + Tailwind v4
- `@settlemint/dalp-sdk` via `createDalpPlatformClient`

## Deploy

Cloudflare Pages — see each app's `wrangler.toml`.
