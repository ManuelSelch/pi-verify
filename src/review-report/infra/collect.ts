import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitScope } from "../../git-scope.js";
import type { ReviewReport, ReviewSection } from "../domain/model.js";

const exec = promisify(execFile);

export async function collectReviewReport(scope: GitScope | undefined, evidence: string[]): Promise<ReviewReport> {
  let base: string | null = null;
  let tree: string | null = null;
  const limitations: string[] = [];
  if (scope) {
    try {
      tree = (await exec("git", ["rev-parse", `${scope.head}^{tree}`], { cwd: scope.repository })).stdout.trim();
      if (scope.baselineMethod === "branch-creation-reflog" && scope.baseline) {
        await exec("git", ["merge-base", "--is-ancestor", scope.baseline, scope.head], { cwd: scope.repository });
        base = scope.baseline;
      }
    } catch {
      limitations.push("The committed comparison or target tree could not be verified.");
    }
  }
  if (!base) limitations.push("Feature branch creation base is unavailable; no comparison was selected.");
  const revision = scope?.head ?? null;
  const section = (source: ReviewSection["source"], status: ReviewSection["status"], sectionScope: string, notes: string[], refs: string[] = []): ReviewSection => ({
    source, status, scope: sectionScope, revision: source === "git" ? revision : null, limitations: notes, evidence: refs,
  });
  const unavailable = (name: string) => section("not-collected", "unavailable", name, ["Analysis has not been collected."]);
  return {
    schemaVersion: 1,
    comparison: {
      status: base && tree ? "available" : "unavailable", base, target: revision, targetTree: tree,
      method: base ? "branch-creation-reflog" : "unavailable", includesUncommitted: false,
      excludedWorkingTree: { staged: scope?.staged ?? [], unstaged: scope?.unstaged ?? [], untracked: scope?.untracked ?? [] },
      limitations,
    },
    sections: {
      overview: section("agent-authored", "available", "Verification summary and checks", ["Checks are agent-reported, not independently collected."], evidence),
      changes: section("not-collected", "unavailable", "Committed feature branch comparison", [...limitations, "Changed files have not been independently collected."]),
      testsCoverage: unavailable("Per-test changed-line coverage"),
      complexity: unavailable("Named module complexity"),
      architecture: unavailable("Component model and static relationships"),
      evidence: section("agent-authored", "available", "Deliberately attached artifacts", [], evidence),
    },
  };
}
