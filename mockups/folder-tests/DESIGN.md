# Folder-grouped tests

- Revision: 1
- Status: in review; not approved for production implementation.
- Goal: replace a flat test list with the actual folder → file → test hierarchy, with no module mapping or inferred test levels.
- Preserve the report's green/white visual language and existing covering-changes, changed-tests, and all-tests views. Architecture is a noninteractive sidebar placeholder, not a proposed removal.
- Compact consecutive single-child folders, but retain every directory segment in the label.
- Folder and file summaries show scoped test counts and failure badges; passing groups start closed, failing ancestors open.
- Search matches test names and full paths. Expand/collapse all controls folder/file groups; individual evidence remains separately expandable.
- Responsive: sidebar becomes a top bar, search/actions stack, hierarchy indentation shrinks.
- Twelve illustrative tests based on report paths, including colocated and shared tests-folder examples. Outcomes, source snippets and line numbers are fake. No real coverage measurement or persistence.
- Covering changes: 9 tests; changed tests: 4; all tests: 12. One simulated failure demonstrates default expansion.
- User review needed: hierarchy density, compacted paths, and counts/status readability. No browser automation performed.
- Existing test source and coverage-evidence journeys must remain available in production; prototype evidence is intentionally abbreviated.
- Approval evidence: none yet.
