# Review report MVP — implementation plan

## Status and approval

- Design: [mockup revision 12](../../mockups/review-mvp/DESIGN.md), approved by the user.
- This is a plan, not authorization to implement or approval of acceptance scenarios. Before production work, draft executable scenarios and obtain explicit approval; the earlier drafts were removed at the user's request.
- Keep all changes uncommitted unless the user changes that instruction.

## Outcome and scope

Add a local HTML review report to pi-verify. Start with this repository's TypeScript/Node stack and provide truthful results for other projects only where an adapter exists. The report has Overview, Changes, Tests & coverage, Complexity, Architecture and Evidence sections. The approved mockup guides layout; it does not authorize removing existing functionality.

Retain `/verify`, prompt-first execution through ordinary tools, `verify_attach`, `verify_finish`, the durable report bundle, the one-time Pi/pi-chat message, and JSON and Markdown outputs. Add HTML as a companion; do not silently replace or alter existing verification outcomes. Continue to distinguish agent-reported checks from independently collected analysis. Explicitly show absent, failed, incomplete, unsupported or stale inputs rather than an empty success.

Out of scope: ticket-to-test requirement mapping, generic endpoint/call-graph complexity, full support for every test runner or language, automatic LLM judgments, dashboards or external services. Evidence may contain sensitive data; only deliberately selected artifacts should be bundled.

## Proposed data and workflow

1. Resolve and record a comparison base and target, their identities, source snapshot/fingerprint and whether uncommitted files are included. Let the caller explicitly select a trunk/base when automatic detection is ambiguous; do not silently change it. On local `main`, comparison against local `main` is empty. If the requested current comparison has no relevant changes, say so and separately demonstrate a recent relevant committed comparison, clearly labelled with both revisions.
2. Keep deterministic analysis separate from agent-authored summaries. Store a versioned structured report with each section's source, measurement scope, revision, status, limitations and references to evidence. Ensure HTML renders unavailable/partial states without inventing data. Preserve historic bundles without migration or rewriting; decide the new schema contract explicitly when scenarios are approved.
3. Collect expensive or potentially side-effecting test measurements only through an explicit, user-approved command/workflow, not implicitly as a side effect of `verify_finish`. Packaging and report rendering must not silently rerun tests. A collected result must be attributable to the exact measured revision and source snapshot; stale or mismatched data is rejected or explicitly unavailable.
4. Generate a self-contained or portable local report bundle with safely escaped content and relative artifact links. Keep the existing Markdown chat message and include a link to HTML without triggering another model turn. Preserve screenshot/log/video attachments and report limitations accurately.

## Slices

### 1. Acceptance contract and foundations

- Draft high-level executable scenarios using this repository's `node:test` conventions and a small test-only driver. Cover actual user journeys and failure states before production code; explicitly identify what remains unchanged. Ask for scenario approval.
- Define the versioned section model, source provenance, base-selection semantics, supported input configuration and report generation boundary. Use temporary Git repositories and deterministic fixtures for tests.
- Verify that existing Markdown/JSON behavior, attachments, interrupted runs and single message emission remain intact. Do not infer individual outcomes from a suite exit code.

### 2. HTML report and evidence

- Render the approved navigation, overview, changes and evidence views from the structured model. Include full-size images and links to selected logs/videos where available; unsupported artifacts remain downloadable, not executable content.
- Bundle all local assets, use safe HTML/URL handling and keyboard-accessible controls, and support narrow screens. No network access is required to view a report.
- Add HTML path to tool result and existing one-time chat message while keeping the existing Markdown and JSON paths. Represent unavailable sections explicitly until their analysis exists.

### 3. Changed-line test list

- Port the idea of `human-review`'s `testcov.py`: intersect per-test executed source lines with added/modified lines from the chosen Git comparison. Ordinary aggregate coverage cannot establish which test ran a line; never derive test identity or status from aggregate coverage.
- Investigate and implement a faithful adapter for this repository's `node:test` runner, including TypeScript source maps. Confirm whether reliable individual-test attribution is feasible for the repository's tests, including nested tests, concurrent execution and repeated names. If isolation or instrumentation is required, document its cost and side effects and make invocation explicit. If it cannot be measured faithfully, report unsupported rather than invent attribution.
- Define an explicit category source/configuration; group E2E, component and unit in that order, with other/unknown categories labelled rather than guessed. Groups start collapsed; each test is one line and expands to the actual source for the measured revision, or an honest unavailable message if source cannot be recovered.
- Include every measured test hitting changed lines, including failing/skipped/unknown status where actually recorded; show run failures, incomplete suites, unmeasurable lines and stale data separately. Preserve source snapshots or revision-bound links so the displayed test cannot silently drift.

### 4. Named module complexity

- Use TypeScript AST analysis with an explicitly documented cognitive-complexity algorithm; measure both revisions with the same version and rules. Identify functions, source locations and changed modules, including added/removed functions and zero scores; show missing sides as unavailable/new/removed, not zero without justification.
- Define named modules using an explicit, reviewable project mapping to source paths; do not assume one file equals one module. For this repository, establish meaningful names and owned paths. Treat unmapped files, overlapping mappings, exclusions, generated code, nested functions and unsupported languages explicitly; count each included function once per module.
- Display module totals and before/after deltas, expanding to files and functions as in the approved mockup. Explain that this is the sum of function-level scores, not execution-flow complexity or a quality verdict. Feature grouping and call-graph analysis are deferred.

### 5. Checked hand-drawn component model

- Define and agree this repository's high-level components and exactly which code-derived relationships can be checked (for example, static module imports mapped to explicitly declared components). Do not claim runtime interactions or deployment behavior from static imports.
- Create a hand-arranged, editable draw.io component diagram with stable semantic identities on components and edges. Implement a test comparing the declared model to code in both directions, with actionable diagnostics for missing/extra elements and explicit rules for external or excluded dependencies. Layout/style remain human-owned.
- Compare base and target diagrams by semantic identities, not pixels or coordinates; render before/after/diff and identify additions/removals. Handle missing diagrams at either revision explicitly, especially initial introduction; do not imply a historical diagram existed. Record renderer limitations and guardrail status separately from diff status.
- The repository has no tracked draw.io model today. After building it, demonstrate the empty local-trunk comparison honestly; use a labelled historical code comparison or a reproducible fixture for diagram changes if no historical diagram exists. Do not fabricate historical diagrams or claim a historical diagram diff that cannot be produced.

### 6. Integration, verification and handoff

- Run approved scenarios and regression tests, including Git revision edge cases, partial/failed collection, source-map fidelity, test identity and stale input, module/diagram drift, accessibility and escaping. Test the generated report and portable evidence links at the appropriate boundaries.
- Offer comparison of implemented UI screenshots with the approved mockup; obtain explicit permission before agent-owned browser automation or screenshot capture. Mockup preview alone does not verify production UI.
- Run the finished analysis on the requested branch/base, show the actual results and, when needed, a clearly labelled relevant recent comparison. Record commands, failures and gaps. Update current documentation and supported-stack/configuration instructions.
- Leave project changes uncommitted as requested. Preserve the approved mockup and scenario examples; do not remove unrelated files or rewrite historical bundles.

## Decisions to confirm with scenario approval

- How should users choose trunk/base and which uncommitted changes belong in a measurement?
- How are named modules, test categories and component boundaries declared for this repository?
- Which test collection command is acceptable if per-test attribution requires rerunning tests or disabling concurrency?
- Is static import-based checking the desired architecture guardrail, given that it cannot prove runtime/deployment relationships?
- Should HTML be purely additive to the existing Markdown/JSON outputs, as proposed above? No compatibility changes are assumed.
