# pi-verify — requirements and implementation plan

Status: backend, report renderer, `/verify`, and four verification lifecycle tools implemented. Full v1 scope/freshness and artifact features remain incomplete.

## Latest implementation slice

- Added explicit `verify_review` self-reviews.
- `verify_finish` assembles criteria, evidence, command outcomes, review records, gate issues, and artifact references automatically; agent-authored context is supplied as optional parameters.
- `/verify` forbids manual report overwrites and requires matching acceptance evidence types.
- A disposable addition-project tool integration test covers missing/supporting/rejecting reviews, failed command evidence, and repeat finishes.
- `verify_finish` now derives Git source metadata, rejects untracked files, and lists commits since an automatically detected baseline. Worktree branch creation reflogs are preferred, then the primary-worktree merge-base; initial commits use the empty tree.
- Markdown now has an executive summary, compact source state, concise checks linked to full evidence logs, short relative artifact links, and simplified commit dates. Exact commands and absolute artifact paths remain in JSON/evidence instead of Markdown tables.
- After `verify_finish`, the extension emits the generated report once as a displayed `pi-verify-report` custom message at `agent_end`, without triggering another model turn.
- Later report freshness rechecking, independent review, automatic test inventory, and live Pi/pi-chat smoke tests remain unimplemented or unvalidated.

## Goal

An optional `/verify` command for Pi and pi-chat that collects task evidence and produces a small, readable verification report. Use Agent Audits as the evidence backend rather than rebuilding its criterion/evidence/review gate.

Sessions are disposable working context. Reports and evidence must survive session deletion and worktree removal.

## Scope and principles

- Composable: works independently of `/todo`, `/worktree`, planning, and cleanup.
- No mandatory lifecycle. A small task can skip planning, browser checks, or independent review.
- Verification is not user acceptance, approval to merge, or permission to clean up.
- Only run when explicitly invoked; no automatic completion interception in v1.
- Report actual evidence, including failures, skipped checks, and uncertainty. Never turn a model assertion into a successful command result.
- Keep v1 small: one slash command, an agent workflow instruction, a local evidence bundle, and a custom report renderer. No global tool-event recorder or plugin framework.

## User experience

```text
/verify
/verify Fix calculator addition
```

1. Establish the task goal, repository, and comparison baseline from the current conversation and Git state.
2. Ask a focused question if the goal, baseline, or verification commands are ambiguous. No compulsory questionnaire.
3. Inspect changes, propose/select appropriate checks, then execute safe checks under normal Pi approval policies.
4. Collect evidence, inspect it, and record explicit reviews through Agent Audits.
5. Generate a Markdown report and structured companion JSON; show the verdict, limitations, and output location in chat.

Commands should work in Pi TUI and pi-chat without custom terminal UI. If clarification is needed but supported UI is unavailable, explain what is missing instead of guessing. Busy-session behavior must be checked against the installed Pi API; avoid overlapping verification runs.

## Required report

- Task goal and short implementation summary.
- Changed production files and what changed in each.
- Added and modified tests: test ID/name, file, tested behavior, and observed result when available.
- Checks actually run: command, working directory, exit code, evidence reference.
- Screenshots, browser evidence, traces, and logs when applicable.
- Checks skipped or unavailable, with reasons.
- Agent Audits verdict and explicit limitations, including whether review was self-review or independent.
- Verification scope: baseline ref/SHA, checked HEAD, working-tree fingerprint, timestamp.

Keep “tests changed” separate from “tests executed.” A passing suite alone does not establish that new tests were added or that all acceptance criteria are covered. Unknown outcomes must remain unknown; absence of newly added tests is not automatically a failure.

## Git scope and freshness

- Include task commits since the selected baseline, staged/unstaged changes, and relevant untracked files; do not silently use only `git diff`.
- Do not default blindly to HEAD: that misses already committed task changes. Resolve and record a baseline; ask when uncertain.
- Avoid including unrelated changes without acknowledging them.
- Snapshot source state before and after checks. Exclude generated verification output and normal build/test artifacts from the source fingerprint.
- If source state changes during verification, stop short of a current VERIFIED handoff and require recollection of affected evidence.
- A historical report remains historical. When rerunning or checking a report, a different source fingerprint means stale evidence; artifact hashes alone do not prove source freshness.

## Agent Audits integration

- External dependency: installed `agent-audits` CLI and its Python runtime. Preflight with actionable errors; never auto-install packages globally.
- Pin/document the tested CLI version or commit. Verify the installed schema and behavior before building the adapter.
- Define/edit task-specific acceptance criteria rather than forcing every task into the generated bug-fix template.
- Capture commands through `add-evidence --command` so actual output and exit codes are recorded. Do not supply invented exit codes or fabricate artifacts.
- Attach existing files as evidence only when their origin is known; preserve copies inside the durable bundle.
- Inspect artifacts before recording `supports`, `does-not-support`, or `unclear`; self-review must be labeled.
- Preserve expected red-phase failures as reproduction evidence, distinct from final passing checks.
- Read `check --json`, acceptance criteria, evidence index, reviews, and referenced artifacts. The gate JSON is not a full report API.
- Preserve unsuccessful gate results and still produce a useful report. Missing evidence or nonzero checks must not terminate the workflow before reporting.
- Never overwrite an existing `.agent-audits` workspace with `init --force`. Validate how to isolate separate runs with the installed CLI before implementation; if no alternate workspace is supported, execute it in a run bundle using explicit source-repository command working directories, and verify this arrangement in a spike.

## Test inventory: v1

The agent inspects the scoped Git patch and test source, then supplies structured added/modified-test entries with file references and behavior descriptions. Execution results are linked to named tests in captured runner output where possible; otherwise report `unknown` or only suite-level results.

The renderer consumes this inventory without inventing entries. Label descriptions/classification as agent-authored, not mechanically proven. Framework-specific JSON/JUnit parsing and AST-based inventory are deferred.

## Durable storage and data

Proposed default: `~/.pi/agent/verification/<project-key>/<run-id>/`, outside disposable worktrees. Use collision-resistant project/run identities. Make the root configurable through one documented setting or environment variable.

```text
<run>/
  report.md
  report.json
  .agent-audits/       # criteria, evidence, reviews, gate receipts
  artifacts/          # copied screenshots, traces, additional logs
```

Minimal report JSON has a schema version, goal, source scope/fingerprint, change summary, test inventory, checks, artifact references, review provenance, gate verdict, skipped checks, and limitations. Link to local bundle-relative evidence paths. Validate references and shape before rendering Markdown.

Do not assume Agent Audits ignores its workspace automatically; inspect the installed version. Do not commit raw evidence, secrets, or machine-specific logs without explicit user intent. Exclude sensitive files from automatic collection and warn that logs/traces may contain secrets; v1 does not promise comprehensive redaction.

## Implementation plan

### 1. Backend integration spike

- Reuse the disposable calculator demo pattern using built-in `unittest`.
- Prove isolated run storage, source-repo command execution, actual failed/passed exit capture, artifact copying, gate JSON, and report generation.
- Check missing dependency, existing workspace, failed gate, and expected TDD failure cases.
- Output: tested commands and a fixture bundle; no extension yet.

### 2. Report model and renderer

- Define the small versioned JSON shape and validation.
- Render required sections with relative evidence links.
- Test added/modified/no tests, unknown results, missing artifacts, failures, skips, and self-review labeling.
- Output: a custom report from the spike bundle.

### 3. Minimal Pi package and `/verify`

- Add `package.json` with an explicit Pi extension entry and host-provided peer dependencies.
- Register `/verify`; inject focused workflow instructions using the installed Pi command/message APIs.
- Let the agent use its existing tools for Git inspection, check selection, CLI evidence collection, and inventory authoring. Add no new orchestration tools unless the spike demonstrates a concrete need.
- Provide a small local report-rendering helper; avoid nested model calls and custom terminal components.
- Display final verdict and durable report paths in chat.
- Keep execution/storage/rendering logic independent of UI.

### 4. Verification and documentation

- Regression tests for command registration/instructions, scope/freshness handling, backend errors, and report rendering.
- Real smoke tests: bug fix, docs-only task, UI task with an existing screenshot/trace.
- Verify invocation in both Pi TUI and pi-chat, including missing UI/dependency behavior.
- Document installation, external CLI requirement, sample output, storage, limitations, and manual artifact removal.

## Acceptance criteria for v1

- `/verify` works without `/todo` or `/worktree` and without a preexisting plan.
- Calculator demo report lists all four added tests and their actual observed outcomes.
- Docs-only tasks can use relevant file/diff evidence without requiring unrelated tests.
- UI evidence can be attached and linked; semantic interpretation is labeled as reviewer judgment.
- Failed, cancelled, timed-out, and skipped checks are not represented as successful checks.
- Reports identify the verified source state and refuse a current-success claim when that state changes.
- Separate verification runs do not overwrite each other's evidence or existing project audit state.
- Reports/evidence remain usable after session deletion and removal of the source worktree.
- No implicit merge, commit, branch deletion, worktree removal, or session deletion.

## Deferred

Independent verifier agents; automatic event-log collection/Agent Audit Gate integration; universal test parsers; dashboard; task status machine; automatic cleanup; remote artifact storage; cryptographic audit receipts.

## Decisions to validate in the spike

- Exact CLI workspace isolation and command working-directory behavior.
- How Agent Audits treats repeated reviews, failed historical evidence, and report generation when the gate fails.
- Smallest reliable source fingerprint and baseline selection behavior.
- pi-chat support for the selected command/message/clarification path.

## References

- Agent Audits: https://github.com/aiswarya797/agent-audits
- Agent Audit Gate (ideas only): https://github.com/Wanbinyu/agent-audit-gate
- Pi extension docs: installed `@earendil-works/pi-coding-agent/docs/extensions.md`
- Pi package docs: installed `@earendil-works/pi-coding-agent/docs/packages.md`
