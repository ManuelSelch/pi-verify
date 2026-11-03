# pi-verify

Composable evidence collection and verification reports for Pi workflows, with a standalone review CLI.

## Quick start

Once published, from a Git project:

```bash
npx @manuelselch/pi-verify review
npx @manuelselch/pi-verify preview
```

Alternatively, install `@manuelselch/pi-verify` as a development dependency and run `npx pi-verify review` and `npx pi-verify preview`. Node.js 20 or later is required.

The review compares committed revisions, excluding working-tree changes. If the branch-creation base cannot be determined, provide `--base REF`. Reports are written to `.pi-verify/`; consider adding it to your project's `.gitignore`. The CLI does not run tests or collect coverage automatically.

## Pi integration

The Pi extension provides `/verify` and evidence-collection tools. For local development, run `npm install` and start Pi with `pi -e ./` from this checkout. See the [reference guide](docs/guide.md#slice-3-minimal-pi-package-and-verify) for installation and behavior.

## Documentation

- [CLI options, report format and verification tools](docs/guide.md)
- [Conceptual diagram comparison and TypeScript guardrail](docs/guide.md#conceptual-diagram-comparison)
- [Supercov per-test coverage spike](spikes/supercov/README.md)

## Development

Run `npm install` and `npm test`. The package has not yet been published; `npm pack` creates a local installable tarball.
