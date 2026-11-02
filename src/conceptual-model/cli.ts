import path from "node:path";
import { collectConceptualModel } from "./collect.js";
import { importCoverage } from "../review-report/infra/coverage.js";
import { writeReportBundle } from "../report.js";
import type { ReviewReport, ReviewSection } from "../review-report/domain/model.js";

async function main() {
  const [base, target = "HEAD", output = "conceptual-review", coveragePath] = process.argv.slice(2);
  if (!base) throw new Error("Usage: node dist/src/conceptual-model/cli.js BASE [TARGET] [OUTPUT_DIR] [COVERAGE_REPORT_JSON]");
  const model = await collectConceptualModel(process.cwd(), base, target);
  const coverage = coveragePath ? await importCoverage(process.cwd(), path.resolve(coveragePath), base, target) : undefined;
  const section: ReviewSection = { status: "unavailable", source: "not-collected", scope: "Not collected in standalone conceptual review", revision: null, limitations: ["Not collected in this standalone conceptual review."], evidence: [] };
  const review: ReviewReport = { schemaVersion: 1, conceptualModel: model, ...(coverage ? { coverage } : {}), comparison: { status: "available", base, target, targetTree: null, method: "unavailable", includesUncommitted: false, excludedWorkingTree: { staged: [], unstaged: [], untracked: [] }, limitations: ["Standalone comparison of explicitly supplied revisions; working tree is excluded."] }, sections: { overview: section, changes: section, testsCoverage: coverage ? { ...section, status: "available", source: "coverage-collector", revision: coverage.comparison.head, scope: "Imported per-test coverage", limitations: coverage.limitations } : section, complexity: section, architecture: { ...section, status: "available", source: "git" }, evidence: section } };
  const paths = await writeReportBundle(path.resolve(output), { goal: "Conceptual model comparison", verdict: "UNKNOWN", source: { branch: "Explicit revision comparison" }, review });
  console.log(JSON.stringify({ base, target, basePresent: model.basePresent, targetPresent: model.targetPresent, guardrail: model.guardrail, delta: model.delta, report: paths.htmlPath }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
