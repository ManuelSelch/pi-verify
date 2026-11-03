# pi-verify

Composable evidence collection and verification reports for Pi workflows, with a standalone review CLI.

## Quick start

From a Git project:

```bash
npx @manuelselch/pi-verify review
npx @manuelselch/pi-verify preview
```

To guard a project's module architecture against a committed draw.io diagram, add `.pi/pi-verify.json` and `docs/architecture.drawio`, then run the working-tree check in `npm test` or CI:

```bash
npx @manuelselch/pi-verify architecture
```

Alternatively, install `@manuelselch/pi-verify` as a development dependency and run `npx pi-verify review`, `npx pi-verify preview` and `npx pi-verify architecture`. Node.js 20 or later is required.

The review compares committed revisions, excluding working-tree changes. If the branch-creation base cannot be determined, provide `--base REF`. Reports are written to `.pi-verify/`; consider adding it to your project's `.gitignore`. Review does not run tests automatically. To collect coverage first, run `npx @manuelselch/pi-verify collect-coverage`; see the [coverage guide](docs/coverage.md) for requirements and scope.

## Pi integration

The Pi extension provides `/verify` and evidence-collection tools, plus `/verify open` and `/verify approve` for the architecture diagram. For local development, run `npm install` and start Pi with `pi -e ./` from this checkout. See the [reference guide](docs/guide.md#pi-package-and-verify) for installation and behavior.

## Documentation

- [CLI options, report format and verification tools](docs/guide.md)
- [Architecture comparison](docs/guide.md#architecture-comparison)
- [Collecting per-test coverage](docs/coverage.md)

## Development

Run `npm install` and `npm test`. `npm pack` creates a local installable tarball.
