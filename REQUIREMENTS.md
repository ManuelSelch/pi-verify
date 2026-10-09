# pi-verify Simplified Flow — Requirements

## Goal
Replace the criterion/evidence/review lifecycle with a prompt-first verification workflow. `/verify` gives the agent a clear structure for inspecting the task and running relevant tests with its ordinary tools. Optional screenshots and other high-level information accompany a short, useful report for the user.

This plan supersedes the previous Agent Audits implementation plan. The existing backend and lifecycle tools are implemented, but are not requirements for the simplified flow. This document plans changes only; it does not claim they are implemented.

## Scope
### In Scope
- `/verify` and `/verify <task focus>` as explicit, optional entry points.
- A focused prompt covering task scope, relevant checks, actual execution, result inspection, optional attachments, and a concise report.
- Removal of low-level verification tools and their required criterion/evidence/review bookkeeping.
- High-level attachment and report publishing, with durable local storage.
- Honest reporting of failures, skipped checks, uncertainty, and self-review.
- Pi TUI and pi-chat compatibility without custom terminal UI.
- Regression tests and documentation for the simplified contract.

### Out of Scope
- Automatic completion interception or verification on every coding task.
- Formal acceptance gates, independent verifier agents, audit receipts, and criterion-by-criterion reviews.
- Global tool-event recording, automatic test discovery, and universal runner-output parsing.
- Dashboards, remote storage, automatic cleanup, and comprehensive secret redaction.
- Implicit commit, merge, worktree removal, repository-ref changes, or session deletion.

## Requirements
- `/verify` works without `/todo`, `/worktree`, a requirements document, or a separate run-start tool call. An optional argument narrows the task focus; otherwise the agent uses the conversation and repository context.
- The prompt structures the work as: identify the task and relevant changes; select checks; execute them; inspect results; attach useful material when applicable; publish the report. Ask a focused question only when ambiguity prevents meaningful verification.
- The agent inspects committed task changes as well as staged, unstaged, and relevant untracked files. It acknowledges unrelated changes and baseline uncertainty rather than silently treating `git diff` against HEAD as the whole task.
- Checks run through the agent's ordinary execution/browser tools under normal host permissions, not a verification-specific command wrapper. No acceptance IDs, evidence IDs, evidence-type matching, or explicit review records are required.
- Remove `verify_start`, `verify_add_evidence`, and `verify_review` from the public tool surface. Do not replace them with renamed tools that impose the same bookkeeping.
- Keep exactly two public verification tools: `verify_attach` for copying existing artifacts and `verify_finish` for publishing a structured summary. Both operate without an explicit start call; `/verify` establishes any minimal report context internally.
- Attachments are optional. Screenshots, logs, videos, traces, and other files can have a short label and description. The extension preserves copies and portable links; it does not require a separate semantic-review call. Attaching a screenshot alone does not prove a behavior passed.
- The publishing operation formats submitted high-level results; it does not rerun checks, require an external gate, or manufacture command outcomes. Execution results are agent-reported from observed tool output and labeled accordingly, not presented as independently captured audit receipts.
- Publish a short Markdown report with: task and outcome; brief change summary; checks actually run and observed results; useful attachments; failures, skipped checks, and limitations. Exact commands and available exit codes may live in compact check entries/JSON rather than dominating the report.
- Distinguish passed, failed, and incomplete verification. A failure or incomplete check still produces a useful report; skipped, cancelled, timed-out, or unknown results never become passes. A clean working tree is not a prerequisite for reporting successful checks.
- Mention added/modified tests separately from executed checks when relevant. Do not infer individual test outcomes from a suite exit code. Detailed per-test inventory is optional, not a mandatory report ritual.
- Include minimal source context and timestamp when available. Disclose scope uncertainty and source changes during checks; do not claim a final source state was checked when it was not. Automated fingerprints and later freshness rechecking are deferred.
- Store reports and copied attachments outside disposable worktrees/sessions in collision-resistant run directories. Preserve existing reports and bundles; do not rewrite historical Agent Audits data. Retain a versioned JSON companion if structured publishing remains, and document any schema change.
- Display each published report once in Pi/pi-chat without triggering another model turn. An interrupted workflow must not display a fabricated completion report.
- Only include deliberately selected artifacts. Warn that logs/traces may contain secrets; never commit raw evidence or machine-specific logs automatically.
- Remove Agent Audits completely from the active implementation, including its CLI/Python dependency, adapter, and gate integration. Do not retain an optional backend or hide its lifecycle behind ordinary shell commands. Verification must work without Agent Audits installed.

## Assumptions
- Agent-authored summaries of observed tool results are sufficient for this lightweight workflow; mechanically proven audit verdicts are no longer the goal.
- Durable reports, optional structured JSON, and the existing report display are worth retaining even though verification orchestration becomes prompt-only.
- Existing historical bundles remain readable as files; no migration or regeneration is required.

## Implementation Plan
### 1. Prompt-First Contract
Description: Rewrite the `/verify` workflow instructions and focused command tests around ordinary tool execution, result inspection, optional attachments, and concise reporting. Remove all criterion/evidence/review instructions. Verify prompt tests cover normal tasks, docs-only tasks, failures, and absent task arguments. This defines the new behavior before changing storage or tools.

### 2. High-Level Report and Attachments
Description: Following slice 1, adapt report publishing and artifact copying to need no explicit start call or audit workspace. Create minimal run context internally and consume compact agent-authored check results, summaries, skipped checks, and limitations. Preserve durable copies, optional JSON, and one-time report display. Verify attachment-first/report-only workflows, missing files, isolated repeated runs, failures/incomplete results, and interrupted runs. Existing low-level tools may remain temporarily until slice 3, but the new flow must not depend on them.

### 3. Remove Audit Lifecycle
Description: Following slice 2, stop registering `verify_start`, `verify_add_evidence`, and `verify_review`; remove unused Agent Audits execution/gate code, obsolete schemas, and backend-dependent tests. Simplify source metadata to report context rather than a clean-tree gate. Verify the exact remaining public surface and run the suite without Agent Audits installed. Leave historical bundles untouched.

### 4. Validate and Document
Description: Following slice 3, update README installation, workflow, tool contracts, storage, report examples, and limitations. Run regression tests and real Pi TUI/pi-chat smoke checks for a passing code task, a failed or incomplete task, a docs-only task, and a task with a screenshot. Verify short reports, honest outcomes, portable attachment links, one-time display, and no low-level bookkeeping or external backend requirement.

## Open Questions
None.
