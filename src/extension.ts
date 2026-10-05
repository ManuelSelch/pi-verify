import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerVerificationTools, type VerificationLifecycleState } from "./verify-tools.js";

export function buildVerifyPrompt(argument: string): string {
  const goal = argument.trim();
  return [
    "Run a composable verification pass for the current task.",
    goal ? `Task focus: ${goal}` : "Infer the task focus from the current conversation and working tree.",
    "",
    "Workflow:",
    "1. Establish the task goal and inspect the relevant changes. verify_finish automatically checks the source state and records created commits.",
    "2. Inspect the diff, including staged, unstaged, committed task changes, and relevant untracked files.",
    "3. Select only relevant checks; small or docs-only tasks may skip unrelated checks.",
    "4. Use verify_start, verify_add_matrix, verify_add_evidence, verify_review, and verify_finish tools; they wrap the installed agent-audits CLI and manage paths. Read the returned acceptance criteria and match their required evidence types exactly.",
    "5. For this demo, verify_add_evidence permits arbitrary commands and records their actual exit codes.",
    "6. Define a verification matrix with verify_add_matrix before checks. The matrix is different from Agent Audits acceptance criteria: use VM-* IDs, one row per observable behavior/input class/boundary/error case, and provide concrete inputs or conditions plus an expected result. Do not copy AC-* criteria or create rows for goal capture, diff review, implementation correctness, or test-suite status. Link evidence to rows via verify_add_evidence.matrixRows. Record added and modified tests separately from tests executed.",
    "7. Inspect the output returned by verify_add_evidence (read the full artifact if truncated), then call verify_review for each criterion/evidence pair with supports/does-not-support/unclear and explanatory notes. These are explicit self-reviews, not independent reviews.",
    "8. Call verify_finish with only agent-authored changes, added/modified tests, skipped-check reasons, and limitations. It generates the durable JSON and Markdown reports automatically.",
    "9. Treat `agent-audits check --json` as gate input, not the final pi-verify report.",
    "",
    "Do not manually write or overwrite `pi-verify-report.json` or `pi-verify-report.md`. verify_finish assembles criteria, evidence, executed checks, gate details, artifacts, and reviews from Agent Audits. Report its paths and actual gate issues, rather than guessing the cause from missing Git metadata.",
    "In `tests`, list added or modified test names and files separately from tests executed; use unknown when the runner does not expose test-level results.",
    "",
    "Do not invent evidence or claim skipped/failed checks passed. Report limitations and label self-review. Do not commit, merge, remove worktrees, alter repository refs, or delete sessions.",
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
    description: "Collect task evidence and generate a verification report",
    handler: async (argument) => {
      pi.sendUserMessage(buildVerifyPrompt(argument));
    },
  });
}
