# Combined review report — revision 3

- Status: revision 3 explicitly approved by the user for implementation.
- Goal: explore tests/coverage and the conceptual model as two sections of one report, with a shared comparison context.
- White background, top-aligned content and only Tests & coverage and Architecture in the navigation. No project card, workspace label, report badge, footer or sidebar footer.
- Tests retain three filters, test details, changed-code hits and uncovered lines. Architecture retains changes/before/after and a labelled green guardrail dot. Per feedback, both panels omit subtitles and comparison notes; the coverage footnote and architecture change summary are removed.
- These removals include existing report journeys, the diagram download and the run-evidence link. They are mockup decisions, not authorization to remove production capabilities; surface them explicitly before any implementation.
- All data and outcomes are illustrative. Coverage and architecture currently have different working-tree semantics; a shared revision is an assumption, not a verified integration.
- Direct views: `?view=coverage` (default), `?view=architecture`. Navigation and filters are local; collection is not wired.
