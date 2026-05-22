# Adding a new example

The goal is for each example to feel like a self-contained, copy-pasteable
project. The repo provides the _scaffold_ (lint, build, types, deploy buttons,
versioning); each example provides the _idea_.

## Step by step

1. **Copy `apps/hello-dalp`** to `apps/<your-example-name>`.

   ```bash
   cp -r apps/hello-dalp apps/<your-example-name>
   ```

2. **Rename in `package.json`**:

   ```json
   {
     "name": "@dalp-examples/<your-example-name>",
     "description": "<one-sentence description>"
   }
   ```

3. **Update `vercel.json`** — change the `--filter` flag in `buildCommand` to your new name.

4. **Update `.env.example`** if you need additional env vars beyond `VITE_DALP_API_URL` and `VITE_DALP_API_KEY`. Add them to the `env` array in `vercel.json` too.

5. **Replace the `README.md`** with a description of what the example shows and a Deploy button:

   ```markdown
   [![Deploy](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsettlemint%2Fdalp-examples&root-directory=apps%2F<your-example-name>&env=VITE_DALP_API_URL,VITE_DALP_API_KEY&project-name=<your-example-name>&repository-name=<your-example-name>)
   ```

6. **Build the example** in `src/routes/*`. Use:
   - `@dalp-examples/dalp-client/react` for DALP calls (do not raw `fetch` to DALP from your app — extend the client instead).
   - `@tanstack/react-query` for caching.
   - `@tanstack/react-form` for forms with mutations.
   - `@dalp-examples/theme` Tailwind preset for styling.

7. **Add a row to the root `README.md`** examples table.

8. **`bun install`** to pick up the new workspace, then verify locally:

   ```bash
   bun run --filter @dalp-examples/<your-example-name> dev
   bun run --filter @dalp-examples/<your-example-name> build
   bun run --filter @dalp-examples/<your-example-name> typecheck
   ```

9. **`bun run changeset`** — record the new package at version `0.1.0`.

## Guidelines

- **One idea per example.** If you find yourself building two things, split them.
- **Keep the floor low.** No mandatory auth/db/i18n. If your example needs them, add them _inside the example_, not as a shared package.
- **Push shared logic down.** If two examples both wrap the same DALP endpoint, extend `packages/dalp-client`.
- **Make it Vercel-deployable.** Every example must have a working Deploy button.
