# pi-verify

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

The package manifest exposes the compiled extension through the Pi package field:

```bash
npm install
npm run build
pi -e ./
```

For a permanent local installation, use Pi's package command from the parent directory:

```bash
pi install ./pi-verify
```

## Verification tools

- `verify_start({ goal })`: infer the source project from the session cwd and return acceptance criteria. Runs are isolated under `~/.pi/agent/audits/<project-key>/<unique-run>/`.
- `verify_add_evidence({ criterion, type, command, summary? })`: execute in the source project and return the evidence ID, actual exit code, artifact path, and captured output (truncated at 16,000 characters). Read the full artifact when truncated. Match the criterion's required evidence type exactly.
- `verify_review({ criterion, evidence, verdict, notes })`: after inspecting output, record an explicit **self-review** (`supports`, `does-not-support`, or `unclear`). Command success alone does not prove a criterion.
- `verify_finish({ changes?, tests?, skipped?, limitations? })`: collect Git source state and assemble JSON and Markdown automatically from acceptance criteria, evidence, reviews, and gate details. Supply only context; never manually overwrite the generated reports.

The tool derives repository, branch, baseline, HEAD, tracked-file fingerprint, staged/unstaged/untracked files, and created commits. Any untracked file makes the custom verdict `NOT VERIFIED`, even if Agent Audits passed. `changes` entries contain file and summary. `tests` lists added/modified tests with name, file, behavior, outcome, and optional evidence IDs. Executed test commands are derived separately from captured `test` evidence; no individual test outcomes are inferred from a successful suite exit. Use `unknown` unless named runner output establishes the result.

The JSON report retains exact commands and complete structured data. Markdown starts with an executive summary, renders source scope compactly, uses evidence summaries instead of multiline commands in tables, uses short, portable relative artifact links while JSON retains absolute paths, and formats commit timestamps as `YYYY-MM-DD HH:mm`. A failed gate still produces reports. Calling finish again regenerates reports using current reviews/evidence.

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
