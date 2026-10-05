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
