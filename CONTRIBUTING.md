# Contributing

Thanks for contributing to DALP Examples!

## Quick rules

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/). Enforced in CI by `commitlint`.
  Examples: `feat(hello): add whoami query`, `fix(asset-explorer): handle empty list`.
- **Changesets**: Every PR that touches an `apps/*` or `packages/*` must include a changeset.
  Run `bun run changeset` and follow the prompts; commit the resulting `.md` file.
- **Lint/format**: `bun run lint` and `bun run format:check` must pass.
- **Typecheck**: `bun run typecheck` must pass across the whole workspace.

## Adding a new example

See [`docs/adding-an-example.md`](./docs/adding-an-example.md).

In short:

1. Copy `apps/hello` to `apps/<your-example>`, rename in `package.json`.
2. Build the example. Keep it focused — one idea per example.
3. Add a Deploy button to its `README.md` and a row to the root `README.md` table.
4. `bun run changeset` to record the new package.

## Releases

Releases are automated by [Changesets](https://github.com/changesets/changesets):

- Merging a PR with a changeset to `main` opens a "Version Packages" PR.
- Merging that PR tags releases and creates GitHub Releases.
