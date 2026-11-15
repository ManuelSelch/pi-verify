# Inspector spike

- Install globally from this checkout: `npm install --global .` (run in the repository root). The Inspector spike is not yet published under a separate package name.
- From any project, generate a self-contained static HTML snapshot from existing JUnit XML and LCOV reports:
  `inspector --junit path/to/junit.xml --lcov coverage/lcov.info`.
- The global npm bin directory must be on your `PATH`; check its location with `npm config get prefix`.
- Add `--no-open` to skip opening the browser; `--output path/to/report.html` changes the output location. Paths resolve from the current project directory.
- Inspector does not run tests or generate coverage. Both input paths are required; invalid or missing reports fail the command.
- The report shows JUnit test cases and their recorded results, durations and failures where provided. A report may represent only a subset of the suite. JUnit does not reliably identify exact source locations, so test source navigation is not implemented.
- LCOV line coverage is shown per file with aggregate line coverage and function/branch counts when provided. Local source inside the project directory is embedded at generation time; missing or external files have no source view. JavaScript and TypeScript source is highlighted using Shiki; other languages are displayed as plain text. Generated HTML contains project source and report contents; share it only with trusted recipients.
- This is a spike: no automatic report discovery, folder totals, architecture, docs or CRAP scores. Legacy pi-verify commands and Pi integration remain temporarily available and are not part of Inspector.
- UI is built with Vite and TypeScript into bundled assets, then embedded into the standalone report by the CLI. The report needs no server or network connection.
