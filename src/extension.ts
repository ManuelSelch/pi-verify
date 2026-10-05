import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerVerificationTools } from "./verify-tools.js";

export function buildVerifyPrompt(argument: string): string {
  const goal = argument.trim();
  return [
    "Run a composable verification pass for the current task.",
    goal ? `Task focus: ${goal}` : "Infer the task focus from the current conversation and working tree.",
    "",
    "Workflow:",
    "1. Establish the task goal, repository, baseline, and current source scope.",
    "2. Inspect the diff, including staged, unstaged, committed task changes, and relevant untracked files.",
    "3. Select only relevant checks; small or docs-only tasks may skip unrelated checks.",
    "4. Use verify_start, verify_add_evidence, and verify_finish tools; they wrap the installed agent-audits CLI and manage paths.",
    "5. For this demo, verify_add_evidence permits arbitrary commands and records their actual exit codes.",
    "6. Record added and modified tests separately from tests executed.",
    "7. Inspect evidence before recording a supports/does-not-support/unclear review.",
    "8. Generate a durable JSON and Markdown report outside disposable worktrees.",
    "9. Treat `agent-audits check --json` as gate input, not the final pi-verify report.",
    "",
    "Write the custom report beside the Agent Audits report as `pi-verify-report.json` and `pi-verify-report.md`.",
    "The JSON must include schemaVersion, goal, verdict, source (repository/baseline/head/fingerprint), changes, tests, checks, artifacts, skipped, limitations, and review.",
    "In `tests`, list added or modified test names and files separately from tests executed; use unknown when the runner does not expose test-level results.",
    "",
    "Do not invent evidence or claim skipped/failed checks passed. Report limitations and label self-review. Do not commit, merge, remove worktrees, delete branches, or delete sessions.",
  ].join("\n");
}

export default function registerVerify(pi: ExtensionAPI): void {
  const state: { current?: Parameters<typeof registerVerificationTools>[2]["current"] } = {};
  registerVerificationTools(pi, () => process.cwd(), state);
  pi.registerCommand("verify", {
    description: "Collect task evidence and generate a verification report",
    handler: async (argument) => {
      pi.sendUserMessage(buildVerifyPrompt(argument));
    },
  });
}
