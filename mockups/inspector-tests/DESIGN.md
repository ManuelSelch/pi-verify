# Inspector test report

- Revision: 4. Status: approved for implementation.
- Goal: browse all reported tests by folder and file, select a test to inspect its result and source, matching the coverage tab's split view.
- Tree supports collapsing groups and filtering by test name or path; statuses are visible on test rows. By default only folders and files containing failed tests are expanded; passing and skipped-only groups are collapsed.
- Missing file paths appear under an unknown-location group. Missing source remains explicitly unavailable.
- Responsive layout stacks the panels at narrow widths, following coverage.
- Data, durations and source availability are illustrative. JUnit only describes reported tests; source locations may be absent.
- File labels omit the `.test` and extension suffix, preserving earlier qualifiers such as `.dom`; full paths remain available for search and details.
- Consecutive single-child folders appear as one slash-separated row; full project-relative paths remain available. Project-local absolute paths are displayed relative to the project root.
- Approval: user explicitly approved revision 4 for implementation.
