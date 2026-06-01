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

### Vercel (one click)

Each app deploys independently — pick the subdirectory and Vercel prompts for the
three DALP env vars during setup.

| App                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Investor** (`apps/investor`) | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsettlemint%2Fdalp-examples&root-directory=apps%2Finvestor&env=DALP_API_URL%2CDALP_API_KEY%2CDALP_ORG_ID&envDescription=DALP%20backend%20URL%2C%20API%20key%2C%20and%20org%20ID&envLink=https%3A%2F%2Fgithub.com%2Fsettlemint%2Fdalp-examples%2Fblob%2Fmain%2Fapps%2Finvestor%2F.env.example&project-name=dalp-investor&repository-name=dalp-examples) |
| **Issuer** (`apps/issuer`)     | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsettlemint%2Fdalp-examples&root-directory=apps%2Fissuer&env=DALP_API_URL%2CDALP_API_KEY%2CDALP_ORG_ID&envDescription=DALP%20backend%20URL%2C%20API%20key%2C%20and%20org%20ID&envLink=https%3A%2F%2Fgithub.com%2Fsettlemint%2Fdalp-examples%2Fblob%2Fmain%2Fapps%2Fissuer%2F.env.example&project-name=dalp-issuer&repository-name=dalp-examples)       |

Each app uses the [Nitro](https://nitro.build) Vite plugin, which Vercel auto-detects
to build full SSR + server functions. The button clones this repo into the user's Git
account — it requires the repo to be **public** (or that the clicker has access).

### Cloudflare Pages

See each app's `wrangler.toml`. The Nitro build emits `.output/server/index.mjs`,
which both the `wrangler.toml` `main` and the `start` script point at.
