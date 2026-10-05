import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
    "4. Use the installed agent-audits CLI to capture real command output and exit codes.",
    "5. Record added and modified tests separately from tests executed.",
    "6. Inspect evidence before recording a supports/does-not-support/unclear review.",
    "7. Generate a durable JSON and Markdown report outside disposable worktrees.",
    "8. Treat `agent-audits check --json` as gate input, not the final pi-verify report.",
    "",
    "Write the custom report beside the Agent Audits report as `pi-verify-report.json` and `pi-verify-report.md`.",
    "The JSON must include schemaVersion, goal, verdict, source (repository/baseline/head/fingerprint), changes, tests, checks, artifacts, skipped, limitations, and review.",
    "In `tests`, list added or modified test names and files separately from tests executed; use unknown when the runner does not expose test-level results.",
    "",
    "Do not invent evidence or claim skipped/failed checks passed. Report limitations and label self-review. Do not commit, merge, remove worktrees, delete branches, or delete sessions.",
  ].join("\n");
}

export default function registerVerify(pi: ExtensionAPI): void {
  pi.registerCommand("verify", {
    description: "Collect task evidence and generate a verification report",
    handler: async (argument) => {
      pi.sendUserMessage(buildVerifyPrompt(argument));
    },
  });
}
