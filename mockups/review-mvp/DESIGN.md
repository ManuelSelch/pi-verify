# Review report MVP

- Revision: 12
- Status: approved for implementation planning.
- Goal: explore a compact local HTML review report with changed-line coverage, checks, and visual evidence.
- Layout: desktop sidebar and main report; compact responsive navigation on narrow screens.
- Overview summarizes verification; Changes lists changed files; Tests & coverage presents a measured changed-line test list; requirement-to-test mapping is out of scope for this MVP; Evidence displays an illustrative full-size image and log.
- Interactions: navigation switches sections; changed-file rows expand. The changed-line test list groups tests outside-in (E2E, component, unit), with groups collapsed by default; each one-line test expands to its source. Mockup source is illustrative; production must show actual test source.
- All content, outcomes, screenshot and log are illustrative fake data. Coverage is aggregate, not per-test attribution. The Complexity tab illustrates named modules with before/after sums and expandable file and function-level cognitive complexity; it does not claim execution-flow analysis. Architecture sketches the current extension, verification tools, Git scope and report modules with changes/before/after controls. The guardrail and comparisons are not implemented.
- Complexity module names reference the repository, but scores and functions are examples, not analysis. Feature grouping and call-graph views are deferred.
- Architecture is a mockup based on current source imports, not a draw.io file or a checked model. Exact component boundaries and code-checkable relationships require definition. Layout-only changes do not count as semantic changes.
- Approval: user explicitly approved revision 12 and requested an implementation plan.
