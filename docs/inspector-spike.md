# Inspector spike

- Install globally from this checkout: `npm install --global .` (run in the repository root). The Inspector spike is not yet published under a separate package name.
- From any project, generate a self-contained static HTML snapshot from existing JUnit XML and LCOV reports:
  `inspector --junit path/to/junit.xml --lcov coverage/lcov.info`.
- The global npm bin directory must be on your `PATH`; check its location with `npm config get prefix`.
- Add `--no-open` to skip opening the browser; `--output path/to/report.html` changes the output location. Paths resolve from the current project directory.
- Inspector does not run tests or generate coverage. Both input paths are required; invalid or missing reports fail the command.
- Tests are grouped by file path in an expandable, filterable tree. Project-local absolute paths are made relative to the project root; single-child folder chains share a row. Only folders and files containing failures start expanded. File labels omit `.test` and the extension while preserving earlier suffixes. Cases without paths appear under Unknown location.
- Selecting a test shows its reported result, duration and failure details and, when available, its full source file. A JUnit report may represent only a subset of the suite and may omit file paths or exact test locations.
- LCOV line coverage is shown per file with aggregate line coverage and function/branch counts when provided. Test and coverage source inside the project directory is embedded at generation time; missing or external files have no source view. JavaScript and TypeScript source is highlighted using Shiki; other languages are displayed as plain text. Generated HTML contains project source and report contents; share it only with trusted recipients.
- Coverage files are organized in an expandable, filterable folder tree. Folder percentages combine covered and executable lines across descendant files.
- This is a spike: no automatic report discovery, architecture, docs or CRAP scores. Legacy pi-verify commands and Pi integration remain temporarily available and are not part of Inspector.
- UI is built with Vite and TypeScript into bundled assets, then embedded into the standalone report by the CLI. The report needs no server or network connection.
