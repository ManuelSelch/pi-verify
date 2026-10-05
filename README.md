# pi-verify

Composable evidence collection and verification reports for Pi workflows.

## Implemented slices

### Slice 1: Agent Audits backend spike

`src/agent-audits.ts` runs the installed `agent-audits` CLI in an isolated run directory while explicitly executing evidence commands in a source repository:

```ts
import { AgentAuditsRun } from "./src/agent-audits.js";

const audit = new AgentAuditsRun("/path/to/source", "/tmp/verification-run");
await audit.init();
await audit.plan("Verify the change");
const evidence = await audit.addCommandEvidence(
  "AC-001", "test", "python3 -m unittest -v", { expectedExitCode: 0 },
);
const gate = await audit.check(); // preserves NOT VERIFIED / blocked results
const report = await audit.report();
```

The source repository does not receive `.agent-audits`; the run directory does. The adapter checks the installed executable and records real command output and exit codes. It intentionally does not install dependencies or claim that a failed gate passed.

### Slice 2: report model and renderer

`src/report.ts` produces versioned JSON and Markdown. It explicitly separates:

- changed files;
- added/modified tests and their outcomes;
- checks and exit codes;
- evidence/artifact links;
- skipped checks and limitations;
- review provenance.

Test entries are supplied by the caller in this slice. The renderer does not invent test names from a passing suite. Framework-specific test-result parsing and Git test inventory extraction are later work.

### Slice 3: minimal Pi package and `/verify`

`src/extension.ts` registers `/verify`. The command sends a focused workflow prompt to the current Pi session; it does not require `/todo`, `/worktree`, planning, or cleanup. It explicitly tells the agent to use the installed `agent-audits` CLI, collect real evidence, list changed tests separately from executed tests, and avoid destructive lifecycle actions.

The package manifest exposes the compiled extension through the Pi package field:

```bash
npm install
npm run build
pi -e ./
```

For a permanent local installation, use Pi's package command from the parent directory:

```bash
pi install ./pi-verify
```

## Tests

Install dependencies and run the TypeScript build/tests:

```bash
npm install
npm test
```
