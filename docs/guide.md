# pi-verify reference

Composable evidence collection and verification reports for Pi workflows.

## Implemented slices

### Slice 1: Agent Audits backend spike

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

### Slice 2: report model and renderer

`src/report.ts` produces versioned JSON and Markdown. It explicitly separates:

- changed files;
- added/modified tests and their outcomes;
- checks and exit codes;
- evidence/artifact links;
- skipped checks and limitations;
- review provenance.

Test entries are supplied by the caller in this slice. The renderer does not invent test names from a passing suite. Framework-specific test-result parsing and Git test inventory extraction are later work.

### Slice 3: minimal Pi package and `/verify`

`src/extension.ts` registers `/verify`. The command sends a focused workflow prompt to the current Pi session; it does not require `/todo`, `/worktree`, planning, or cleanup. It tells the agent to use the verification tools, collect real evidence, list changed tests separately from executed tests, and avoid destructive lifecycle actions.

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

The package provides `pi-verify review` and `pi-verify preview` independently of Pi. Once published, install it in your project with `npm install --save-dev @manuelselch/pi-verify`, then use `npx pi-verify review` and `npx pi-verify preview` (or add npm script aliases). Without installing, use `npx @manuelselch/pi-verify review` and `npx @manuelselch/pi-verify preview`. From this checkout, `npm pack` builds a tarball that can be installed in another project with `npm install --save-dev /path/to/manuelselch-pi-verify-0.1.0.tgz`.

`review` compares committed revisions; it does not run tests or collect coverage. By default it uses the verified feature-branch creation reflog base and HEAD. When the base is unavailable or not an ancestor, specify `--base REF`; `--target REF` optionally selects another commit. The report records staged, unstaged and untracked files excluded from the comparison. Missing diagrams and uncollected analysis are marked unavailable, not passed.

Reports are written to `.pi-verify/` at the Git root. Add that directory to the project's ignore rules if generated files should stay untracked. `--output DIR` selects another bundle directory, relative to the current directory. The last generated report's location is stored in `.pi-verify/latest-report.txt`; `preview` opens it as a local HTML file using the system default application. `preview --output DIR` opens a specific bundle instead. Copy the whole bundle to preserve artifact links.

Optionally supply `--coverage-report FILE` to import previously collected compatible Supercov evidence; this never runs measurement. Coverage collection remains a separate [spike](../spikes/supercov/README.md), with its documented setup and limitations. Invalid or mismatched supplied evidence causes the command to fail. Run `pi-verify --help` for the command options.

## Review report foundations

New JSON reports produced by `verify_finish` include a separately versioned `review` object. Its comparison uses the feature branch's creation reflog entry as the base and committed HEAD as the target; it records the target Git tree ID and lists staged, unstaged, and untracked files as excluded. If the creation base cannot be verified as an ancestor of HEAD, the review comparison is unavailable rather than falling back to another base. This is separate from the existing verification report's baseline detection.

The review sections identify their source, scope, revision, status, limitations, and evidence references. When the committed repository contains a supported conceptual diagram, the Architecture section compares it at the selected committed revisions. Source-code conformance is checked only when the project explicitly configures a TypeScript source file. Tests & coverage can import an explicitly collected Supercov spike report; it is unavailable unless compatible evidence is supplied. The HTML navigation contains these two sections; the other verification summaries, checks, changes and selected evidence remain under its collapsed Verification details and in the existing JSON and Markdown. No external measurement command is run by `verify_finish`. Historical bundles are not rewritten.

Each new bundle also contains a standalone HTML report. `verify_finish` returns its path with the existing JSON and Markdown paths; the one-time Pi message links to it without triggering a model turn. The report uses embedded styles and no network assets or scripts, and links only to selected artifacts inside the bundle using relative paths. Supported raster screenshots appear at their natural size up to the available width; logs, videos, SVGs and other files are downloadable rather than embedded. Copy the whole bundle to preserve evidence links. Navigation uses URL fragments and CSS; a modern browser supporting `:has()` is required to switch sections. HTML is escaped and the report uses a restrictive content security policy; attached files themselves remain untrusted.

## Conceptual diagram comparison

### Reuse in another project (diagram-only)

Commit an uncompressed draw.io XML diagram and, if it is not at `docs/conceptual-model.drawio`, a `.pi/conceptual-model.json` at the Git repository root:

```json
{
  "diagram": "frontend/docs/conceptual-model.drawio"
}
```

Paths are repository-relative, using `/`; absolute paths, traversal and unknown configuration fields are rejected. Each revision uses its own committed configuration, so moving a configured diagram does not lose its history. Without configuration, `docs/conceptual-model.drawio` is used. Configuration and diagrams in the working tree are excluded, just like other comparison inputs.

No source file is required. The existing Changes / Before / After views work independently of source checking; the guardrail is explicitly unavailable with “Source-code conformance checking is not configured; diagram comparison only.” This does not mean the comparison failed or that the diagram matches the implementation. `/verify` collects the configured diagram automatically; the standalone CLI below also works when launched from another project's Git root.

The current format requires stable `concept` attributes on boxes and `assoc` attributes on relationships (for example `concept="Project"` and `assoc="Employee-Project"`), with edge endpoints referring to the box IDs. Use the two concept names in sorted order, joined by `-`, for an association's identity. Visible box labels may differ from identities in diagram-only mode; changing a label or relationship cardinality counts as a change, moving/resizing a box does not. Attributes can be edited in draw.io's Edit Data dialog. See [the example drawing](../docs/conceptual-model.drawio) for the XML structure.

Only uncompressed, single-page draw.io XML is supported, not `.drawio.png` or compressed drawings. The renderer shows concept boxes and straight relationship lines, not arbitrary draw.io shapes, styling, annotations or routing. Additions are green; removals and changes are listed. The target diagram is bundled as `conceptual-model.drawio` when present.

To generate a standalone report for CSMM (or any other repository):

```bash
# From the pi-verify checkout:
npm ci
npm run build
VERIFY_CLI="$PWD/dist/src/conceptual-model/cli.js"

# Replace this with the path to the other project's Git root:
cd path/to/csmm-repository
node "$VERIFY_CLI" "$(git merge-base HEAD origin/main)" HEAD /tmp/csmm-conceptual-review
```

Open the `report` HTML path printed by the command. The base and target must be committed Git revisions; a missing historical drawing is labelled absent, not fabricated. No CSMM-specific files or diagram are generated by pi-verify.

### Optional TypeScript conformance check

Add `"source": "path/to/domain-model.ts"` to the same configuration to enable the existing single-file TypeScript guardrail. This is an explicit opt-in, not required for diagram diffs. This repository opts in via [.pi/conceptual-model.json](../.pi/conceptual-model.json).

[docs/conceptual-model.drawio](../docs/conceptual-model.drawio) is the editable, hand-arranged model of the exported type aliases in [the review-report domain](../src/review-report/domain/model.ts). Its `concept` and `assoc` attributes identify boxes and links independently of layout. Relationships are type references between those aliases; references inside arrays and `Record` are many, shown by `*` at the referenced end. These are structural type relationships, **not** runtime, deployment or complete repository architecture. Exported interfaces, multi-page/compressed drawings and draw.io PNGs are not supported; unsupported input fails rather than being presented as verified. Open the XML file in draw.io and keep visible labels, metadata and multiplicities aligned. Layout and styling belong to the human; `placed="auto"` marks an unfinished box and fails the check.

For pi-verify's own drawing, `npm test` runs the bidirectional guardrail: missing, extra, duplicated or undeclared concepts and associations, wrong labels, endpoints and visible cardinalities fail. The review section independently evaluates the same guardrail against committed source; its status is not a claim that tests ran. It compares semantic identities and cardinalities, excluding the working tree. A missing base drawing is explicitly labelled absent; unavailable bases and invalid data are not treated as successful comparisons. The built-in report renderer uses box positions and straight links, not full draw.io styling or routing; additions are green, while removals and changes are listed. A downloadable draw.io snapshot accompanies the HTML bundle. Other projects select their own diagram and optional source through the configuration above; the TypeScript extractor still supports only exported type aliases in a single file.

For an explicit comparison, build and supply Git refs (the report's Architecture tab contains the result):

```bash
npm run build
node dist/src/conceptual-model/cli.js "$(git merge-base HEAD origin/main)" HEAD /tmp/conceptual-review
```

The command reads committed blobs, not local edits. The regular `/verify` report continues to use its existing verified branch-creation base; it does not silently switch to a merge-base. To include coverage, first collect the [Supercov spike](../spikes/supercov/README.md) with the same base and explicit source/test allowlists. Pass its `report.json` as the fourth argument after the output directory, or provide its path in `verify_finish({ goal, coverageReport })`. Keep `supercov-evidence.json` next to it. Import checks the base, target, captured sources and recorded configuration against the committed comparison; stale or mismatched coverage is unavailable, not silently merged. Coverage collection runs `npm test` in the target project and has the spike's Node/runner and scope limitations. The Jest adapter is validated with Jest 30, ts-jest and jsdom in a repository subdirectory, and a small Next.js Jest/TSX example. It has not been run against the CSMM project or validated against every Next.js setup. It may fail on unsupported or truncated Supercov output. Both evidence and source snapshots can contain sensitive data. The report embeds the imported neutral evidence and its limits, and flags failed or incomplete runs; it does not claim execution proves assertion quality. TypeScript source, test diffs and coverage contexts use Shiki's github-light theme at report-generation time; the resulting report needs no network or highlighting runtime.

The model and semantic-diff approach are adapted from [human-review](https://github.com/victorrentea/human-review) and [petclinic's conceptual model guardrail](https://github.com/victorrentea/petclinic/tree/main/petclinic-backend/src/test/java/victor/training/petclinic/guardrail), rewritten for this TypeScript project.

## Standalone TypeScript coverage spike

[Supercov per-test coverage spike](../spikes/supercov/README.md) provides explicit collection and compact HTML/JSON reports for supported `node:test` and Jest runs. Pass its neutral JSON report to `verify_finish` or the standalone report command to include it; neither runs measurement automatically. For a monorepo, point `--root` to the frontend package and use paths relative to that package. The report records the project path within the repository, and import validates the committed snapshot and Jest/Next configuration files.

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
