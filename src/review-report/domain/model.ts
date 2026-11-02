export type ReviewSection = {
  status: "available" | "unavailable";
  source: "git" | "coverage-collector" | "agent-authored" | "not-collected";
  scope: string;
  revision: string | null;
  limitations: string[];
  evidence: string[];
};

export type ReviewReport = {
  schemaVersion: 1;
  conceptualModel?: import("../../conceptual-model/collect.js").ConceptualReview;
  coverage?: import("../infra/coverage.js").CoverageReport;
  comparison: {
    status: "available" | "unavailable";
    base: string | null;
    target: string | null;
    targetTree: string | null;
    method: "branch-creation-reflog" | "unavailable";
    includesUncommitted: false;
    excludedWorkingTree: { staged: string[]; unstaged: string[]; untracked: string[] };
    limitations: string[];
  };
  sections: Record<"overview" | "changes" | "testsCoverage" | "complexity" | "architecture" | "evidence", ReviewSection>;
};
