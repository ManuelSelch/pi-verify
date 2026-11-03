# Supercov TypeScript per-test coverage spike

Experimental local collector for TypeScript `node:test` and Jest. Its neutral `report.json` can be explicitly imported into pi-verify's combined report; `/verify` does not run the collector automatically. Supercov is the collection adapter.

## Run

Requires Node **22.18+**, npm, Git, and macOS/Linux (the compiled fixture uses a directory symlink). Validated on macOS with Node 26.5.0. Supercov is pinned to **4.22.0**; coverage is local and requires no account or API key.

```sh
cd spikes/supercov
npm ci
npm run typecheck
npm test
npm run demo
```

`demo` prints the path to a new `output/run-*/index.html`. Open it directly in a browser; no server or build is required for the generated report. Each run is retained, rather than replacing a previous run. Examples:

- **normal:** native TypeScript `node:test` execution.
- **compiled:** `tsc` builds JavaScript with source maps; per-test hits resolve to original TypeScript.
- **overlap:** two async tests synchronize with promises so they genuinely overlap. Their alpha/beta function hits remain disjoint; two setup-hook records remain separate.
- **failure:** a deliberately failing test retains its observed execution and failed outcome; the run is not reported as successful.
- **stale:** source is edited after measurement; current changed-line attribution is withheld.

The `demo` command succeeds when all example reports are generated; its deliberate failing-test example has test exit code 1, preserved in its report. `npm test` asserts these expected results with the real pinned collector.

## Inspect a project/worktree

This is an experimental **TypeScript + node:test or Jest** adapter, not a validated Vitest or Playwright integration. The target must already have dependencies installed and a non-watch `npm test` script. It executes that script through Supercov in the target project; tests can write files or contact services. Supercov also creates its own workspace in the target. Review the command and side effects before running it. The project may live inside a Git repository subdirectory (for example, `frontend/`); source/test paths are relative to that project.

```sh
npm run collect -- \
  --root /path/to/project \
  --base main \
  --source src/pricing.ts \
  --test tests/pricing.test.ts \
  --out /path/to/report
```

Repeat `--source` and `--test` to declare scope. Paths for these two options are relative to the target root and must exist. `--base` is an **explicit commit/ref**, not an automatically selected merge base: use `git merge-base HEAD main` when PR merge-base semantics are wanted. Comparison is that revision versus the current worktree, including committed/staged/unstaged target changes and declared untracked files. No project refs or source files are rewritten. Unrelated files outside the allowlists are not covered by this analysis.

`collect` preserves the measured test command's nonzero exit code; stale evidence returns 2 when the test command passed. Collector launch, timeout, schema, and truncation failures fail explicitly instead of fabricating a report.

### Combine coverage with pi-verify

After collection, keep `report.json` and `supercov-evidence.json` together. From the target repository, with pi-verify built (`npm run build` in pi-verify), run:

```sh
node /path/to/pi-verify/dist/src/conceptual-model/cli.js \
  BASE_COMMIT HEAD /private/path/to/combined-report \
  /private/path/to/collector-output/report.json
```

Alternatively pass `coverageReport` to `verify_finish`; its verified branch-creation base must match the collector base. Both imports require the source/test snapshots and captured project configuration to match the committed target; uncommitted edits cannot be presented as committed evidence. Regenerate reports after updating the collector. The Architecture view is unavailable unless the target supports the separate conceptual model. Only explicitly allowlisted source/test files receive changed-line analysis; all captured run output and embedded source may be sensitive.

## Report behavior

- Filter order: **Tests covering changes / Changed tests / All tests**. Tests covering changes is selected initially; only matching test-name rows are visible and all details are collapsed.
- **Tests covering changes:** tests with exact observed execution of changed source locations, including unchanged tests. This does not imply their assertions detect a defect.
- **Changed tests:** added or edited **test definitions**, not every test in an edited file. Expansion shows a unified test diff; added tests are entirely additions.
- **All tests:** recorded individual tests plus recognized static declarations missing evidence (outcome/attribution unknown). Expand to the measured test source and metadata.
- Source, both sides of test diffs, and enclosing functions have Shiki TypeScript/TSX syntax colors (github-light). The before/after sides of a diff are tokenized separately to preserve multiline comment/template state. There is no new word-level diff algorithm.
- “Show changed-code hits” expands the whole enclosing function. A teal gutter and soft teal background mark only changed locations executed by that test. Other lines have neutral backgrounds and syntax-colored text, not a claimed full execution path. Module-level locations use nearby lines instead.
- Report-level uncovered changed locations expand separately, with amber gutters/soft backgrounds and full-function context. Non-executable or unknown locations do not become false coverage gaps.
- The compact **Run evidence** link opens a separate local evidence page with metadata, measurement limits, setup records, removed tests and all existing JSON/log download links. The main report omits the explanatory footer and teal/amber paragraphs removed during mockup review. Failure/stale/unknown warnings remain visible where applicable.
- Filter interactions reset expanded rows. Repeated names receive file/line qualifiers.

The HTML is self-contained, escapes source/name/diff/token text, and uses no external assets. Shiki 4.6.0 runs only in the report generator with a bundled TypeScript grammar, github-light theme and JavaScript regex engine; the browser gets escaped token spans and no highlighting runtime or grammar downloads. Whitespace, original line separators and JSON source snapshots are preserved. Copy the entire scenario output directory to retain the evidence page and relative download links. Avoid sharing its fixture directory or raw evidence without inspecting them.

## Architecture and artifacts

- [analysis.ts](src/analysis.ts): TypeScript AST extraction of static test definitions/enclosing functions, target-side Git hunk locations, small test-definition diffs.
- [collector.ts](src/collector.ts): invokes the pinned local Supercov, selects an immutable run ID, follows test-inventory pagination, reads individual tests and changed-line obligations through JSON CLI queries, checks completeness, and normalizes evidence. It does not read Supercov's private binary index. Inherited `NODE_TEST_CONTEXT` is removed at this independent runner boundary so running the spike inside node:test does not suppress the target runner.
- [model.ts](src/model.ts): versioned, collector-neutral individual test evidence, outcomes, source hashes/snapshots, change classifications, changed-line status and setup records.
- [highlight.ts](src/highlight.ts): synchronous generation-time Shiki tokenization with explicit language/theme imports; HTML-safe token spans, whitespace preservation, and independent diff sides. Shared text escaping lives in [html.ts](src/html.ts).
- [report.ts](src/report.ts): main/evidence HTML rendering plus JSON/HTML writes. Small inline filtering script; native disclosures provide keyboard-operable expansion. Syntax token spans do not interfere with Git-diff backgrounds or coverage gutters.
- [acceptance.test.ts](tests/acceptance.test.ts): durable integration scenarios with fresh shared driver setup/disposal in `beforeEach`/`afterEach`.
- [highlighting.test.ts](tests/highlighting.test.ts): approved scenarios for syntax colors, unchanged source/diff text, neutral context, offline safety and preserved evidence access. [highlight.test.ts](tests/highlight.test.ts) also checks LF/CRLF/CR and multiline lexical state.

Each measured scenario writes `index.html`, `evidence.html`, `report.json`, adapter-specific `supercov-evidence.json`, `run-id.txt`, and stdout/stderr logs. The demo also preserves its generated Git fixture and `.supercov` run store for inspection. Generated dependencies, reports and raw evidence are ignored by Git and are not committed.

At generation, source/test/package snapshots and hashes, HEAD, and package/lockfile/tsconfig hashes are rechecked. Added/deleted configuration files also invalidate evidence. Stale reports preserve historical snapshots and observed outcomes but suppress current changed-line attribution. A saved HTML file cannot automatically detect later edits to a checkout: rerun collection before relying on it for another revision.

## Scope and limits

- Automated fixtures cover native and compiled TypeScript with `node:test`, plus Jest 30 with ts-jest and jsdom in a repository subdirectory. A small separate Next.js Jest/TSX example was also run manually. These do not establish support for every Jest configuration, Next.js transformation, build system, runner, browser, child process or concurrency pattern.
- Static recovery understands direct `test`, `it`, and `describe` calls with literal names. Jest parameterized tests retain measured identity/outcomes, but their source/diff classification is unknown. Aliases, parameterized/generated tests, `t.test`, and wrapper APIs are not recovered automatically. Measured identities without unique source matches remain visible with an explicit limitation. Same-scope duplicate names cannot be classified as changed reliably.
- Renamed tests appear as removed plus added. Moving a test between files has the same limitation. A changed helper is not attributed to every test by guesswork.
- Source locations follow Supercov's executable obligation/line model, not statement-level change semantics. A line hit does not establish which changed expression was evaluated when several expressions share that line.
- Head coverage cannot describe deleted code; deleted source lines are excluded. A separate base-revision coverage run would be needed for deleted-code impact.
- Current freshness scope is the allowlisted source/test files, HEAD, package/lockfiles and tsconfig—not every environment variable, external service, data file, config file or dependency installed on disk.
- Supercov responses without a line obligation can omit line coverage. The collector uses their explicit anchored/covered obligation counts, retaining expression-only decisions and treating zero-obligation blank/closing lines as non-executable.
- Individual-test pages are combined by source location and checked against the reported line total; ambiguous, inconsistent or truncated data fails explicitly. Background execution is not credited to test bodies and makes otherwise unproven gaps unknown. A source with no measured obligations is unknown rather than a coverage success. Truncated changed-line responses fail explicitly. There is no fallback to approximate attribution.
- Ordinary raw evidence/logs can contain absolute paths and source text; do not commit or publish them blindly. The neutral model embeds measured code deliberately.
- No Swift/C# adapter, automatic suite selection, mutation testing or AI assertion assessment is included.

The approved [mockup revision 5](../../mockups/supercov-spike/DESIGN.md) remains preserved. Rendering/interaction logic is tested at code boundaries; implemented-browser visual comparison is a separate user-approved review.
