import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerVerificationTools, type VerificationLifecycleState } from "./verify-tools.js";
import { approveArchitecture } from "./architecture/approve.js";
import { openArchitectureDiagram } from "./architecture/open.js";

export function buildVerifyPrompt(argument: string): string {
  const goal = argument.trim();
  return [
    "Run a prompt-first verification pass for the current task.",
    goal ? `Task focus: ${goal}` : "Infer the task focus from the current conversation and working tree.",
    "",
    "Workflow:",
    "1. Establish the task goal and inspect the relevant code or docs changes. Use the ordinary execution and browser tools available in this session.",
    "2. Inspect the actual diff, including committed task changes, staged changes, unstaged changes, and relevant untracked files. Call out baseline uncertainty when needed.",
    "3. Choose only the checks that matter for this task; docs-only tasks may skip unrelated suites, while code changes should run the smallest relevant validation.",
    "4. Run the relevant test, lint, typecheck, smoke, or browser commands, then inspect the real output. Inspect the actual output and label results as passed, failed, skipped, cancelled, timed-out, or unknown.",
    "5. When useful, attach screenshots, logs, terminal output, traces, or other artifacts using verify_attach. Each attachment should have a short label and a description, and should be selected deliberately.",
    "6. Call verify_finish with a compact summary of the task, the files changed, the tests executed, the checks run, skipped items, limitations, and any useful attachments. If a compatible Supercov spike report.json was explicitly collected, supply its path as coverageReport; do not invent coverage or silently execute collection. This generates durable JSON, Markdown, and HTML reports automatically.",
    "7. Report the outcome honestly: do not say a failed or incomplete check passed. If the task was not fully validated, say so clearly and list what remains uncertain.",
    "",
    "Required behavior:",
    "- Keep the report short and user-facing; include the task outcome, a brief summary of the change, checks run, tests or validation commands, skipped items, limitations, and attachments.",
    "- When listing tests, separate added and modified tests from tests executed. Use unknown when a runner does not expose per-test results.",
    "- Mention source changes during checks and note baseline uncertainty instead of pretending the repo state was fully understood.",
    "- Do not manually write or overwrite `pi-verify-report.json`, `pi-verify-report.md`, or `pi-verify-report.html`; verify_finish manages the files.",
    "- Logs and traces may contain secrets, so include only what is needed and omit noisy raw dumps.",
    "- If the project configures an architecture diagram (.pi/pi-verify.json), refresh it from the code with `npx pi-verify architecture --write` when this task adds, removes or moves a slice or its dependencies, so the architecture change is part of the review. Say so in the report.",
    "- Do not commit, merge, remove worktrees, alter repository refs, or delete sessions.",
    "",
    "Directives:",
    "- Use only the public verification tools: verify_attach and verify_finish.",
    "- This workflow intentionally avoids the old low-level verification lifecycle and does not rely on agent-audits or acceptance criteria.",
    "- If a task is blocked or incomplete, produce a clear verification result with failures or limitations rather than a fake success.",
    "- For self-review, answer the question: was the task actually validated, and what remains uncertain?",
    "",
    "The final report should differentiate between passed, failed, skipped, cancelled, timed-out, and unknown states; it should not rely on a fixed test runner or a hidden backend.",
  ].join("\n");
}

export function emitPendingVerificationReport(
  state: VerificationLifecycleState,
  sendMessage: (message: { customType: string; content: string; display: boolean; details: unknown }, options: { triggerTurn: boolean }) => void,
): boolean {
  const pending = state.pendingReport;
  if (!pending || pending.shown) return false;
  pending.shown = true;
  sendMessage(
    {
      customType: "pi-verify-report",
      content: pending.markdown,
      display: true,
      details: {
        verdict: pending.verdict,
        allowed: pending.allowed,
        auditDir: pending.auditDir,
        jsonPath: pending.jsonPath,
        markdownPath: pending.markdownPath,
      htmlPath: pending.htmlPath,
      },
    },
    { triggerTurn: false },
  );
  return true;
}

export default function registerVerify(pi: ExtensionAPI): void {
  const state: VerificationLifecycleState = {};
  registerVerificationTools(pi, () => process.cwd(), state);
  pi.on("agent_end", async () => {
    emitPendingVerificationReport(state, (message, options) => pi.sendMessage(message, options));
  });
  pi.registerCommand("verify", {
    description: "Verify the task, or use /verify open and /verify approve for the architecture diagram",
    getArgumentCompletions: (prefix) => {
      const subcommands = [
        { value: "open", label: "open", description: "Open the architecture diagram in VS Code" },
        { value: "approve", label: "approve", description: "Accept the diagram placement and commit the architecture files" },
      ];
      if (prefix.includes(" ")) return null;
      const matches = subcommands.filter(subcommand => subcommand.value.startsWith(prefix.trim().toLowerCase()));
      return matches.length ? matches : null;
    },
    handler: async (argument, ctx) => {
      const command = argument.trim().toLowerCase();
      if (command === "open" || command === "approve") {
        const result = command === "open" ? await openArchitectureDiagram(process.cwd()) : await approveArchitecture(process.cwd());
        ctx.ui.notify(result.message, result.ok ? "info" : "error");
        return;
      }
      pi.sendUserMessage(buildVerifyPrompt(argument));
    },
  });
}
