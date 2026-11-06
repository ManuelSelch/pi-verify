# Folder-grouped tests

- Revision: 2
- Status: revision 2 approved as the production design. Production implementation has not started.
- Goal: replace a flat test list with a shallow owning-folder → file → test hierarchy, with no module mapping or inferred test levels.
- Preserve the report's green/white visual language and existing covering-changes, changed-tests, and all-tests views. Architecture is a noninteractive sidebar placeholder, not a proposed removal.
- Show each owning path as a top-level group, with no intermediate directory levels. A colocated `__tests__` or `tests` marker defines the owning directory and is omitted from display. Remaining subpaths (e.g. `integration/calendar.test.ts`) stay on the file row. A shared root `tests/` keeps a single `tests` group, with `unit/` and `integration/` in file labels. Without a test marker, group by the immediate parent directory. Original paths remain intact for identity, search and evidence.
- Folder and file summaries show scoped test counts and failure badges; passing groups start closed, failing ancestors open.
- Search matches test names and full paths. Expand/collapse all controls folder/file groups; individual evidence remains separately expandable.
- Responsive: sidebar becomes a top bar, search/actions stack, hierarchy indentation shrinks.
- Twelve illustrative tests based on report paths, including colocated and shared tests-folder examples. Outcomes, source snippets and line numbers are fake. No real coverage measurement or persistence.
- Covering changes: 9 tests; changed tests: 4; all tests: 12. One simulated failure demonstrates default expansion.
- User review needed: shallow owner groups and relative file labels, plus counts/status readability. Revision 2 responds to feedback that the original tree had too much nesting, particularly `__tests__`. No browser automation performed.
- Existing test source and coverage-evidence journeys must remain available in production; prototype evidence is intentionally abbreviated.
- Approval evidence: user explicitly said “approved” after reviewing revision 2's owning-folder → file → tests layout, without `__tests__` or intermediate directory levels.
