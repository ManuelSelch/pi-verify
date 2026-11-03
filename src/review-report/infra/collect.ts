import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitScope } from "../../git-scope.js";
import type { ReviewReport, ReviewSection } from "../domain/model.js";
import { collectArchitecture, type ArchitectureReview } from "../../architecture/collect.js";
import { importCoverage, type CoverageReport } from "./coverage.js";

const exec = promisify(execFile);

export async function collectReviewReport(scope: GitScope | undefined, evidence: string[], coveragePath?: string): Promise<ReviewReport> {
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
    source, status, scope: sectionScope, revision: source === "git" || source === "coverage-collector" ? revision : null, limitations: notes, evidence: refs,
  });
  const unavailable = (name: string) => section("not-collected", "unavailable", name, ["Analysis has not been collected."]);
  let architecture: ArchitectureReview | undefined;
  let architectureFailure: string | undefined;
  if (scope) {
    try {
      const collected = await collectArchitecture(scope.repository, base, scope.head);
      if (collected && (collected.targetPresent || collected.basePresent)) architecture = collected;
    } catch (error) {
      architectureFailure = `Architecture could not be collected: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  let coverage: CoverageReport | undefined;
  let coverageFailure: string | undefined;
  if (coveragePath) {
    if (!scope || !base) coverageFailure = "Coverage unavailable: a verified committed comparison is required.";
    else {
      try { coverage = await importCoverage(scope.repository, coveragePath, base, scope.head); }
      catch (error) { coverageFailure = `Coverage unavailable: ${error instanceof Error ? error.message : String(error)}`; }
    }
  }
  return {
    ...(architecture ? { architecture } : {}),
    ...(coverage ? { coverage } : {}),
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
      testsCoverage: coverage ? section("coverage-collector", "available", "Imported per-test changed-line coverage", coverage.limitations) : section("not-collected", "unavailable", "Per-test changed-line coverage", [coverageFailure ?? "Coverage has not been collected or supplied."]),
      complexity: unavailable("Named module complexity"),
      architecture: architecture
        ? section("git", "available", "Committed architecture diagram comparison", ["Slice diagram checks import direction between top-level folders; not runtime interactions.", ...architecture.guardrail.diagnostics])
        : section("not-collected", "unavailable", "Architecture", [architectureFailure ?? "No committed architecture diagram was collected."]),
      evidence: section("agent-authored", "available", "Deliberately attached artifacts", [], evidence),
    },
  };
}
