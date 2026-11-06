# pi-verify reference

Composable evidence collection and verification reports for Pi workflows.

## Agent Audits backend

`src/agent-audits.ts` runs the installed `agent-audits` CLI in an isolated run directory while explicitly executing evidence commands in a source repository:

```ts
import { AgentAuditsRun } from "./src/agent-audits.js";

const audit = new AgentAuditsRun("/path/to/source", "/tmp/verification-run");
await audit.init();
await audit.plan("Verify the change");
const evidence = await audit.addCommandEvidence(
  "AC-001", "test", "python3 -m unittest -v", { expectedExitCode: 0 },
);
const gate = await audit.check(); // preserves NOT VERIFIED / blocked results
const report = await audit.report();
```

The source repository does not receive `.agent-audits`; the run directory does. The adapter checks the installed executable and records real command output and exit codes. It intentionally does not install dependencies or claim that a failed gate passed.

## Report model and renderer

`src/report.ts` produces versioned JSON and Markdown. It explicitly separates:

- changed files;
- added/modified tests and their outcomes;
- checks and exit codes;
- evidence/artifact links;
- skipped checks and limitations;
- review provenance.

Test entries are supplied by the caller. The renderer does not invent test names from a passing suite; framework-specific test-result parsing and Git test inventory extraction are not provided.

## Pi package and `/verify`

`src/extension.ts` registers `/verify`. The command sends a focused workflow prompt to the current Pi session; it does not require `/todo`, `/worktree`, planning, or cleanup. It tells the agent to use the verification tools, collect real evidence, list changed tests separately from executed tests, and avoid destructive lifecycle actions.

Two argument subcommands act on the diagram directly, without a model turn (Tab completes them). `/verify open` opens the configured diagram in VS Code, falling back to the default application. `/verify approve` clears the placement markers and commits only the diagram and `.pi/pi-verify.json`; it never pushes and never stages unrelated work. Everything else — including no argument — is still sent to the agent as the verification task focus.

After `verify_finish` writes the report, the extension stores it as a pending completed report. At `agent_end`, it emits the report once as a displayed `pi-verify-report` custom message with `{ triggerTurn: false }`, so it appears in Pi/pi-chat without starting another model turn. Reports are not emitted for runs that stop before `verify_finish`, and repeated lifecycle events do not duplicate the message.

The package manifest exposes the TypeScript extension source through the Pi package field:

```bash
npm install
pi -e ./
```

For a permanent local installation, use Pi's package command from the parent directory:

```bash
pi install ./pi-verify
```

Pi loads `src/extension.ts` directly through its TypeScript loader. A build is only required for this repository's compiled tests, not for reloading the installed package.

## Standalone CLI

The package provides `pi-verify review`, `pi-verify preview` and `pi-verify architecture` independently of Pi. Install it in your project with `npm install --save-dev @manuelselch/pi-verify`, then use `npx pi-verify review`, `npx pi-verify preview` and `npx pi-verify architecture` (or add npm script aliases). Without installing, use the same commands through `npx @manuelselch/pi-verify`. From this checkout, `npm pack` builds a tarball that can be installed in another project with `npm install --save-dev /path/to/manuelselch-pi-verify-0.1.2.tgz`.

`architecture` is the working-tree guardrail and the CI entry point: it reads `.pi/pi-verify.json`, checks the current files (not committed revisions) against `docs/architecture.drawio`, prints every problem and exits non-zero on failure. It takes no other arguments, so it fits directly into `npm test` or a CI step:

```bash
npx pi-verify architecture
```

`npx pi-verify architecture --write` rebuilds the diagram from the code instead of only checking it. Existing boxes keep the position, size and style a human gave them; removed slices and arrows are dropped; new slices wait in a staging lane marked `placed="auto"` and are listed as `Awaiting human placement` until someone moves them in draw.io, after which the next `--write` clears the marker. Moving is optional: `npx pi-verify architecture --accept` clears every placement marker and restores the normal box style without changing positions, for when the automatic placement is already good. Removals need no action — a slice whose folder disappeared and its arrows are simply dropped, and the command reports the negative counts. With `"transitive": true` it writes the transitive reduction, so only the essential arrows are drawn. The command then runs the normal check and prints its result. This is the intended agent workflow: the agent refreshes the diagram with the feature, and the human approves the resulting diff and lays out any staged box. In Pi the same step is `/verify open` to edit the diagram followed by `/verify approve`, which clears the markers and commits only the diagram and configuration.

`review` compares committed revisions; it does not run tests or collect coverage. By default it uses the verified feature-branch creation reflog base and HEAD. Without a creation base, it uses the merge-base with the branch’s configured upstream, comparing local commits not yet pushed (including when histories have diverged). It does not fetch; run `git fetch` to refresh remote refs. When neither base is available or the selected base is not an ancestor, specify `--base REF`; `--target REF` optionally selects another commit. The report records staged, unstaged and untracked files excluded from the comparison. Missing diagrams and uncollected analysis are marked unavailable, not passed.

Reports are written to `.pi-verify/` at the Git root. Add that directory to the project's ignore rules if generated files should stay untracked. `--output DIR` selects another bundle directory, relative to the current directory. The last generated report's location is stored in `.pi-verify/latest-report.txt`; `preview` opens it as a local HTML file using the system default application. `preview --output DIR` opens a specific bundle instead. Copy the whole bundle to preserve artifact links.

Run `pi-verify collect-coverage` first to collect coverage explicitly; review automatically imports the default evidence. Use `--coverage-report FILE` to import evidence from another location. Review never runs measurement, and invalid or mismatched evidence causes it to fail. See the [coverage guide](coverage.md) for requirements, options and limitations. Run `pi-verify --help` for the command options.

## Review report foundations

New JSON reports produced by `verify_finish` include a separately versioned `review` object. Its comparison uses the feature branch's creation reflog entry as the base, falling back to the configured upstream merge-base when no creation base is available, and committed HEAD as the target; it records the target Git tree ID and lists staged, unstaged, and untracked files as excluded. The comparison method records `branch-creation-reflog` or `upstream-merge-base`. If neither is available or the selected base cannot be verified as an ancestor of HEAD, the review comparison is unavailable. This is separate from the existing verification report's baseline detection.

The review sections identify their source, scope, revision, status, limitations, and evidence references. When the committed repository configures an architecture diagram, the Architecture section compares it at the selected committed revisions and checks the code's folder imports against it. Tests & coverage can import an explicitly collected Supercov report; it is unavailable unless compatible evidence is supplied. The HTML navigation contains these two sections; the other verification summaries, checks, changes and selected evidence remain under its collapsed Verification details and in the existing JSON and Markdown. No external measurement command is run by `verify_finish`. Historical bundles are not rewritten.

Each new bundle also contains a standalone HTML report. `verify_finish` returns its path with the existing JSON and Markdown paths; the one-time Pi message links to it without triggering a model turn. The report uses embedded styles and no network assets or scripts, and links only to selected artifacts inside the bundle using relative paths. Supported raster screenshots appear at their natural size up to the available width; logs, videos, SVGs and other files are downloadable rather than embedded. Copy the whole bundle to preserve evidence links. Navigation uses URL fragments and CSS; a modern browser supporting `:has()` is required to switch sections. HTML is escaped and the report uses a restrictive content security policy; attached files themselves remain untrusted.

## Configuration

A single committed `.pi/pi-verify.json` at the Git repository root configures pi-verify:

```json
{
  "architecture": {
    "diagram": "docs/architecture.drawio",
    "root": "src",
    "strict": false,
    "slices": ["features/*", "*"],
    "transitive": false
  }
}
```

- `architecture` is optional. `diagram` and `root` are required when it is present; `strict` defaults to `false`. An absent or `null` `architecture` disables architecture checking.
- `slices` is an optional, ordered list of folder patterns where `*` matches one path segment; the first match wins. The default `["*"]` makes every immediate subfolder of `root` a slice. `["features/*", "*"]` groups `features/briefing/...` as the slice `features/briefing` while every other top-level folder stays a slice. A file no pattern matches belongs to no slice.
- `transitive` (default `false`) also accepts a code dependency when the diagram reaches it through other slices, so a redundant direct arrow such as `A→C` can be left out when `A→B→C` is drawn. This weakens the check from "exact allowed direct dependencies" to "allowed reachability".
- Paths are repository-relative, using `/`; absolute paths, traversal and unknown fields are rejected. Each revision uses its own committed configuration.

The file is read at the compared revisions, not from the working tree.

## Architecture comparison

The architecture guardrail checks module-level structure: folders under `root` are the slices (selected by `slices` patterns, defaulting to each immediate subfolder), and imports between them are the dependencies. It is optional; without an `architecture` key in [.pi/pi-verify.json](#configuration) nothing is collected.

`npx pi-verify architecture` runs the check against the working tree and is the usual way to adopt it in another project or CI. It resolves the nearest `.pi/pi-verify.json` from the working directory up to the Git repository root, and resolves `diagram` and `root` relative to that directory — so a package inside a monorepo keeps its own configuration and the check runs with the package as the working directory. `review` additionally compares committed revisions and renders the HTML panel; it locates the same configuration in the committed tree (the repository root, or the single package-local `.pi/pi-verify.json`) and reads the diagram from the compared revisions, so both must be committed. `/verify` collects the same comparison automatically.

Commit an uncompressed, single-page draw.io XML diagram with one box per slice and one directed arrow per allowed dependency. Boxes carry `concept="domain"` with the box label equal to the folder name; arrows carry `assoc="domain->infra"`, and the two ends name the arrow's direction. Attributes can be edited in draw.io's Edit Data dialog. See [the example drawing](../docs/architecture.drawio) for the XML structure.

For a project other than pi-verify itself:

```json
{
  "architecture": { "diagram": "docs/architecture.drawio", "root": "src" }
}
```

The guardrail reads TypeScript sources and resolves relative imports, including `.js` specifiers that point at `.ts` sources, plus tsconfig `compilerOptions.paths` aliases such as `@/*` (read from `tsconfig.json` next to the package; `extends` is not followed). Tests, declarations, `node_modules` and `dist` are skipped. Folders must match the diagram's boxes both ways, and every cross-folder import must be an arrow.

By default arrows are an allow-list of direct dependencies: every code dependency must be an arrow, while an allowed-but-unused arrow is reported as "Allowed but unused" instead of failing. `"strict": true` fails unused arrows too, and `"transitive": true` additionally allows a dependency the diagram reaches through a path, which is how you keep the picture small by drawing only the essential arrows. A file directly under the root belongs to no slice, and unresolved specifiers (assets, external files) are ignored rather than reported. Visible labels, box positions and styling belong to the human; only identities and arrow direction are checked, so moving or resizing a box is not a change.

Each revision uses its own committed configuration, and the working tree is excluded. When `/verify` or `review` runs, the target diagram is bundled as `architecture.drawio`, and the report renders the panel with Changes / Before / After views and links the diagram with `vscode://file/...` so it opens in VS Code. A missing historical diagram is labelled absent; unavailable bases and invalid data are not treated as successful comparisons.

This is an import-graph check, not a runtime or dynamic-dependency check. Bare package specifiers are external (unless a tsconfig alias resolves them), slices are the folders the `slices` patterns select, and each source file is read with one `git show` call. Only uncompressed, single-page draw.io XML is supported, not `.drawio.png` or compressed drawings.

To generate a standalone report for another repository:

```bash
# From the pi-verify checkout:
npm ci
npm run build
VERIFY_CLI="$PWD/dist/src/architecture-cli.js"

# Replace this with the path to the other project's Git root:
cd path/to/other-repository
node "$VERIFY_CLI" "$(git merge-base HEAD origin/main)" HEAD /tmp/architecture-review
```

Open the `report` HTML path printed by the command. The base and target must be committed Git revisions; the command reads committed blobs, not local edits, and accepts an optional coverage report as a fourth argument.

The slice approach is adapted from [human-review](https://github.com/victorrentea/human-review) and [petclinic's package architecture guardrail](https://github.com/victorrentea/petclinic/tree/main/petclinic-backend/src/test/java/victor/training/petclinic/guardrail), rewritten for this TypeScript project.

## TypeScript coverage collection

The [coverage collector](coverage.md) provides explicit collection for supported `node:test` and Jest runs. `pi-verify review` imports default coverage automatically; pass its neutral JSON report to `verify_finish` or use `--coverage-report` for another location. Neither review nor `verify_finish` runs measurement automatically. For a monorepo, point `--root` to the frontend package and use paths relative to that package. Import validates the base, target, captured sources and recorded configuration against the committed comparison; stale or mismatched coverage is unavailable, not silently merged. The Jest adapter is validated with Jest 30, ts-jest and jsdom in a repository subdirectory, and a small Next.js Jest/TSX example; it has not been validated against every Next.js setup and may fail on unsupported or truncated Supercov output. Both evidence and source snapshots can contain sensitive data. TypeScript source, test diffs and coverage contexts use Shiki's github-light theme at report-generation time; the resulting report needs no network or highlighting runtime.

## Verification tools

- `verify_start({ goal })`: infer the source project from the session cwd and return acceptance criteria. Runs are isolated under `~/.pi/agent/audits/<project-key>/<unique-run>/`.
- `verify_add_evidence({ criterion, type, command, summary? })`: execute in the source project and return the evidence ID, actual exit code, artifact path, and captured output (truncated at 16,000 characters). Read the full artifact when truncated. Match the criterion's required evidence type exactly.
- `verify_attach({ path, type, label, description? })`: copy a screenshot, log, video, Playwright trace, or other file into the durable bundle with a checksum and size.
- `verify_review({ criterion, evidence, verdict, notes })`: after inspecting output, record an explicit **self-review** (`supports`, `does-not-support`, or `unclear`). Command success alone does not prove a criterion.
- `verify_finish({ changes?, tests?, skipped?, limitations? })`: collect Git source state and assemble JSON and Markdown automatically from acceptance criteria, evidence, reviews, and gate details. Supply only context; never manually overwrite the generated reports.

The tool derives repository, branch, baseline, HEAD, tracked-file fingerprint, staged/unstaged/untracked files, and created commits. Any untracked file makes the custom verdict `NOT VERIFIED`, even if Agent Audits passed. `changes` entries contain file and summary. `tests` lists added/modified tests with name, file, behavior, outcome, and optional evidence IDs. Executed test commands are derived separately from captured `test` evidence; no individual test outcomes are inferred from a successful suite exit. Use `unknown` unless named runner output establishes the result.

The JSON report retains exact commands, audit criteria, reviews, source metadata, and complete artifact data. Markdown is intentionally short: summary, changed files, added/changed tests, commits, evidence, and notes. It uses short, portable relative artifact links while JSON retains absolute paths, and formats commit timestamps as `YYYY-MM-DD HH:mm`. A failed gate still produces reports. Calling finish again regenerates reports using current reviews/evidence.

### Current limitations

- Commands are unrestricted and logs may contain sensitive data.
- Reviews are self-reviews, not independent verification.
- Test inventory and change summaries are agent-authored.
- Baseline detection uses the oldest branch reflog entry when it records `branch: Created from ...`; this identifies where a worktree feature branch started. Initial repositories use Git's empty tree. Otherwise, a non-primary worktree uses its merge-base with the primary worktree branch. If none is reliable, the baseline stays unknown and the report says its commit list may be incomplete.
- A tracked-file fingerprint is collected at finish time, but later report freshness is not automatically rechecked.
- In-memory run state is not restored across reloads or sessions. Reload the extension (or restart Pi) after updating to expose `verify_review` and the new `/verify` prompt.

## Tests

Install dependencies and run the TypeScript build/tests:

```bash
npm install
npm test
```

The lifecycle integration test creates a separate disposable Node addition project and calls the registered tool handlers with its cwd against the real installed Agent Audits CLI. It checks missing reviews, successful reviews, rejected evidence, failed commands, and repeated report generation. This is a tool-handler integration test, not a live model-session test.
