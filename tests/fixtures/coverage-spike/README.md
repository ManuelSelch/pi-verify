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

## Real TypeScript and limitations

`preload.cjs` is an experimental `node:test` preload, not production code. The automated spike runs two separate files in parallel child processes against compiled `src/report.ts`, remaps V8 ranges using Node source maps, and intersects mapped lines with a committed Git comparison in a temporary repository. It also demonstrates that a failing test still emits a snapshot, but the snapshot contains no outcome. Nested tests with the same name in the same process are indistinguishable; a setup hook's coverage is charged to the test. Concurrent tests in one process remain incorrectly attributed. The prototype examines named functions only and its character-to-line conversion has not been validated for arbitrary code, branches, or source maps; it is not a complete coverage algorithm.

A separate manual experiment ran `pi-chat-npm.cjs` against Pi Chat's real `src/shared/node/npm-command.ts` at `2a5e224`, using Pi Chat's `tsx` loader and this preload. Both tests ran in one `node:test` process; source-mapped hits intersected the committed `a9899e4^..2a5e224` diff (the target file was added in that range). `resolves the installed npm` mapped to lines 8–12, 15–16, 19–20, 23; `rejects a relative executable` mapped to 8–10, 12, 16, 20–23. These are experimental candidate hits, not independently verified precise line coverage. The fixture is ours: Pi Chat's actual `npm-command.test.ts` uses Vitest, not `node:test`; that real Vitest suite ran separately (17 passed) without this preload. No Pi Chat files were changed.

To repeat that manual experiment when the Pi Chat checkout is at `../../../pi-chat` and its dependencies are installed:

```sh
root=$(pwd)
cd ../../../pi-chat
SPIKE_TARGET=src/shared/node/npm-command.ts SPIKE_OUTPUT="$root/spike-pichat.jsonl" node --enable-source-maps --import tsx --require "$root/tests/fixtures/coverage-spike/preload.cjs" --test "$root/tests/fixtures/coverage-spike/pi-chat-npm.cjs"
cd "$root"
node -e 'for (const l of require("fs").readFileSync("spike-pichat.jsonl", "utf8").trim().split("\n")) console.log(JSON.stringify(JSON.parse(l), null, 2))'
rm spike-pichat.jsonl
```

No LCOV output, Vitest hook, reliable test identity/outcome, concurrency protection, or performance measurement exists yet. Hook ordering, module initialization and teardown need deeper investigation. Node v26.5.0 was used; compatibility with the package's Node 20 minimum has not been established.
