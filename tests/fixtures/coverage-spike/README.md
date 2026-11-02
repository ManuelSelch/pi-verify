# node:test per-test coverage spike

Run `npm run build && node --test dist/tests/node-coverage-spike.test.js` from the repository root.

The fixture uses `node:test` before/after-each hooks and V8 inspector precise coverage. It runs two tests in one child suite and snapshots/reset counters at each boundary. The integration test checks two cases:

- Serial tests: each snapshot reports its own fixture function and not the other.
- Concurrent tests: a deterministic barrier forces overlapping execution; the first snapshot includes both functions, while the second loses its own hit. This demonstrates that process-wide counters cannot safely attribute overlapping tests by reset alone.

This is an experiment, not a coverage adapter. It requires hooks in the fixture; it does not demonstrate transparent injection into existing suites, line-level LCOV output, TypeScript source-map remapping, nested tests, duplicate names, test failures, or practical performance. Counts are function-level observations, and the test intentionally verifies the concurrency failure rather than claiming concurrent attribution works. Node v26.5.0 was used for the initial experiment; compatibility with the package's Node 20 minimum has not been established.
