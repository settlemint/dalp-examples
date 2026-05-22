# Deploying

Every example deploys independently to [Vercel](https://vercel.com). The
fastest path is the Deploy button in each example's README.

## How the Deploy button works

It opens Vercel's "Clone & Deploy" flow with:

- `repository-url` — this GitHub repo
- `root-directory` — `apps/<example-name>`, so Vercel only builds that app
- `env` — the env var names users must fill in
- `project-name` / `repository-name` — sensible defaults

After click → fork → Vercel runs the `buildCommand` from `apps/<name>/vercel.json`, which performs a workspace-aware install + build.

## Manual setup

If you cannot use the button (existing project, custom team, etc.):

1. Create a new Vercel project pointing at this repo.
2. Set **Root Directory** to `apps/<example-name>`.
3. **Framework Preset**: Other.
4. **Install Command**: leave empty (handled by buildCommand).
5. **Build Command**:
   `cd ../.. && bun install --frozen-lockfile && bun run --filter @dalp-examples/<name> build`
6. **Output Directory**: `dist`
7. Add env vars: `VITE_DALP_API_URL`, `VITE_DALP_API_KEY`.

## Preview deploys

Vercel will automatically create preview deploys for every PR. No GitHub
Actions setup needed on this side.

## Other platforms

The build output (`dist/server/`) is a Node-compatible SSR bundle and works on any Node.js
host (Netlify, Cloudflare Pages, Fly.io, plain VPS). The TanStack Start docs
have details: <https://tanstack.com/start>.
