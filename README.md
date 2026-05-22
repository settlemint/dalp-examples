<p align="center">
  <img src="https://github.com/settlemint/sdk/blob/main/logo.svg" width="160" alt="SettleMint" />
  <h1 align="center">DALP Examples</h1>
  <p align="center">
    Frontend examples for the <a href="https://docs.settlemint.com">SettleMint Digital Asset Lifecycle Platform</a>.
  </p>
</p>

A minimal, opinionated scaffold for showing how a frontend application talks
to DALP. It ships with the smallest possible starting point so the team can
build additional examples on top.

## Examples

| Example                                | Description                                                     | Deploy                                                                                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`apps/hello-dalp`](./apps/hello-dalp) | The smallest working DALP app. One route, one query (`whoami`). | [![Deploy](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsettlemint%2Fdalp-examples&root-directory=apps%2Fhello-dalp&env=VITE_DALP_API_URL,VITE_DALP_API_KEY&project-name=hello-dalp&repository-name=hello-dalp) |

## Stack

Every example uses the same opinionated stack — matching what the DALP repo
itself uses, minus the backend bits:

- **Runtime**: [Bun](https://bun.com) (pinned in `.bun-version`)
- **Build**: [TanStack Start](https://tanstack.com/start) on top of Vite
- **Data**: [TanStack Query](https://tanstack.com/query), [Form](https://tanstack.com/form), [Table](https://tanstack.com/table), [Router](https://tanstack.com/router)
- **DALP client**: [`@dalp-examples/dalp-client`](./packages/dalp-client) — a thin typed wrapper around the DALP HTTP API
- **Styling**: Tailwind v4 + the shared [`@dalp-examples/theme`](./packages/theme)
- **Lint/format**: [oxlint](https://oxc.rs) + [oxfmt](https://github.com/oxc-project/oxfmt)
- **Monorepo**: [Turborepo](https://turborepo.com) + bun workspaces
- **Versioning**: [Changesets](https://github.com/changesets/changesets)

## Getting started

```bash
bun install

cp apps/hello-dalp/.env.example apps/hello-dalp/.env.local
# edit VITE_DALP_API_URL to point at a running DALP dapi

bun run dev                                         # all apps at once (turbo)
bun run --filter @dalp-examples/hello-dalp dev      # just hello-dalp
```

See [`docs/getting-started.md`](./docs/getting-started.md) for the full guide.

## Layout

```
dalp-examples/
├─ apps/
│  └─ hello-dalp/             # minimal example
├─ packages/
│  ├─ dalp-client/            # typed DALP API wrapper + React provider
│  ├─ theme/                  # Tailwind preset + tokens
│  └─ tsconfig/               # shared TS configs
├─ docs/                      # how to add examples, deploy, etc.
├─ .changeset/                # versioning
└─ .github/workflows/         # CI + release
```

## Adding an example

See [`docs/adding-an-example.md`](./docs/adding-an-example.md). The short
version: copy `apps/hello-dalp`, rename, run `bun install`, and add a row to
the table above with a Deploy button.

## Contributing

Conventional commits, changesets on every PR. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](./LICENSE).
