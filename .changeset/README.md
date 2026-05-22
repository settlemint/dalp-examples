# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) for
versioning. Every PR that changes a published package or app must include a
changeset.

```bash
bun run changeset
```

Pick the package(s), the bump type (patch/minor/major), and write a short
human-readable summary. Commit the generated `.md` file with your PR. Once
merged to `main`, the release workflow opens a "Version Packages" PR; merging
that PR cuts the actual releases.
