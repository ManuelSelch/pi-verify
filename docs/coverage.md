# Coverage collection

`pi-verify collect-coverage` runs the target project's `npm test` through the bundled Supercov adapter, then stores neutral evidence in `.pi-verify/coverage/` at the Git root. It requires Node.js 22.18 or later, Git, npm, installed project dependencies and a non-watch test script. Supercov is an optional package dependency; installation must include optional dependencies. Collection executes project code, may access services or write files, and creates a `.supercov/` workspace in the target project. Review test side effects before running it. Evidence and logs may contain sensitive source code and output.

```bash
npx pi-verify collect-coverage
npx pi-verify review
npx pi-verify preview
```

The separate coverage command is intentional: it executes tests, whereas `review` reads committed architecture diagrams directly without executing them. Collection selects the verified feature-branch creation base, just like review; use `--base REF` on both commands if it is unavailable or a different comparison is desired. Review always generates a new report and never runs tests. It imports the default evidence when the measured sources, tests and project configuration still match the committed target, so later commits that do not change those files keep the existing coverage. Evidence measured from different sources is not shown. Pass `--coverage-report` to require an exact base and target match; a mismatched explicit file fails instead of being ignored. Failed tests produce a nonzero collection exit code and retain their outcome in the evidence.

By default, the collector recursively discovers Git-tracked TypeScript source files under `src/` and TypeScript test files under `tests/`. Declaration files are excluded, as are recognized test files within source directories. Discovery is a convenience, not proof of complete scope. To select other directories, repeat `--source` and `--test` with project-relative directory paths; providing either option replaces that category's default. Individual files are not accepted. For a monorepo, use `--root path/to/package` with paths relative to that package. Git-ignored and untracked files are not automatically discovered.

```bash
npx pi-verify collect-coverage --root frontend --base origin/main \
  --source src --test tests
npx pi-verify review --base origin/main
```

`--output DIR` changes the collection output directory. To import a non-default directory, use `pi-verify review --coverage-report DIR/report.json`; keep `supercov-evidence.json` beside it. The default is imported automatically when present. Remove the default coverage directory if you want a review without it. Add `.pi-verify/` and `.supercov/` to the target project's ignore rules if appropriate.

The adapter is validated for TypeScript with `node:test` and Jest, including compiled TypeScript with source maps and a small Next.js Jest/TSX example. It is not validated for every runner, configuration or concurrency pattern. Static test mapping recognizes literal `test()`, `it()` and `describe()` declarations; dynamic or parameterized cases can remain unknown. The source/test allowlist limits the analysis, and observed execution is not proof of assertion strength. Unsupported or incomplete collector responses fail or are explicitly marked uncertain. See the [original spike notes](../spikes/supercov/README.md) for background and its separate experiments.
