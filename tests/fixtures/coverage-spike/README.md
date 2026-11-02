# node:test per-test coverage spike

Run `npm run build && node --test dist/tests/node-coverage-spike.test.js` from the repository root.

The fixture uses `node:test` before/after-each hooks and V8 inspector precise coverage. It runs two tests in one child suite and snapshots/reset counters at each boundary. The integration test checks two cases:

- Serial tests: each snapshot reports its own fixture function and not the other.
- Concurrent tests: a deterministic barrier forces overlapping execution; the first snapshot includes both functions, while the second loses its own hit. This demonstrates that process-wide counters cannot safely attribute overlapping tests by reset alone.

To inspect per-test generated-file lines and the raw V8 ranges:

```sh
SPIKE_MODE=serial SPIKE_OUTPUT=coverage-spike.json node --test tests/fixtures/coverage-spike/hooked-suite.cjs
node -p "JSON.stringify(require('./coverage-spike.json'), null, 2)"
rm coverage-spike.json
```

Use `SPIKE_MODE=overlap` to inspect the misleading attribution for concurrent tests. `files` lists lines in the JavaScript fixture; `ranges` retains V8's UTF-16 offsets and counts. The experiment restricts analysis to its two named fixture functions and ignores the module wrapper, so these line numbers are not a general-purpose coverage implementation.

This is an experiment, not a coverage adapter. It requires hooks in the fixture; it does not demonstrate transparent injection into existing suites, line-level LCOV output, TypeScript source-map remapping, nested tests, duplicate names, test failures, or practical performance. The test intentionally verifies the concurrency failure rather than claiming concurrent attribution works. Node v26.5.0 was used for the initial experiment; compatibility with the package's Node 20 minimum has not been established.
