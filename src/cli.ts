#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { collectGitScope } from "./git-scope.js";
import { collectConceptualModel } from "./conceptual-model/collect.js";
import { importCoverage } from "./review-report/infra/coverage.js";
import { writeReportBundle } from "./report.js";
import type { ReviewReport, ReviewSection } from "./review-report/domain/model.js";

const exec = promisify(execFile);
const usage = `Usage: pi-verify review [--base REF] [--target REF] [--output DIR] [--coverage-report FILE]
       pi-verify preview [--output DIR]`;

function options(args: string[], allowed: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!allowed.includes(key) || result[key] || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Invalid option: ${key}\n${usage}`);
    result[key] = args[++i];
  }
  return result;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") { console.log(usage); return; }
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) { console.log(usage); return; }
  if (command === "preview") {
    const opts = options(args, ["--output"]);
    let root: string;
    try { root = (await exec("git", ["rev-parse", "--show-toplevel"])).stdout.trim(); }
    catch { root = process.cwd(); }
    let report: string;
    if (opts["--output"]) report = path.resolve(opts["--output"], "pi-verify-report.html");
    else {
      try { report = (await readFile(path.join(root, ".pi-verify", "latest-report.txt"), "utf8")).trim(); }
      catch { report = path.join(root, ".pi-verify", "pi-verify-report.html"); }
    }
    try { await access(report); } catch { throw new Error(`No report found at ${report}; run pi-verify review first.`); }
    if (process.platform === "darwin") await exec("open", [report]);
    else if (process.platform === "win32") await exec("rundll32.exe", ["url.dll,FileProtocolHandler", report]);
    else await exec("xdg-open", [report]);
    console.log(report);
    return;
  }
  if (command !== "review") throw new Error(`Unknown command: ${command}\n${usage}`);
  const opts = options(args, ["--base", "--target", "--output", "--coverage-report"]);
  const scope = await collectGitScope(process.cwd());
  const git = async (...argv: string[]) => (await exec("git", argv, { cwd: scope.repository })).stdout.trim();
  const target = await git("rev-parse", "--verify", `${opts["--target"] ?? "HEAD"}^{commit}`);
  const selected = opts["--base"] ?? (scope.baselineMethod === "branch-creation-reflog" ? scope.baseline : null);
  if (!selected) throw new Error("Branch creation base is unavailable; specify --base REF.");
  const base = await git("rev-parse", "--verify", `${selected}^{commit}`);
  if (!opts["--base"]) {
    try { await git("merge-base", "--is-ancestor", base, target); }
    catch { throw new Error("Branch creation base is not an ancestor of target; specify --base REF."); }
  }
  const tree = await git("rev-parse", `${target}^{tree}`);
  const model = await collectConceptualModel(scope.repository, base, target);
  const coverage = opts["--coverage-report"] ? await importCoverage(scope.repository, path.resolve(opts["--coverage-report"]), base, target) : undefined;
  const section: ReviewSection = { status: "unavailable", source: "not-collected", scope: "Not collected in standalone review", revision: null, limitations: ["Not collected in this standalone review."], evidence: [] };
  const hasModel = model.basePresent || model.targetPresent;
  const review: ReviewReport = {
    schemaVersion: 1,
    ...(hasModel ? { conceptualModel: model } : {}),
    ...(coverage ? { coverage } : {}),
    comparison: { status: "available", base, target, targetTree: tree, method: opts["--base"] ? "explicit" : "branch-creation-reflog", includesUncommitted: false, excludedWorkingTree: { staged: scope.staged, unstaged: scope.unstaged, untracked: scope.untracked }, limitations: ["Working tree changes are excluded."] },
    sections: {
      overview: section, changes: section, complexity: section, evidence: section,
      testsCoverage: coverage ? { ...section, status: "available", source: "coverage-collector", revision: target, scope: "Imported per-test coverage", limitations: coverage.limitations } : section,
      architecture: hasModel ? { ...section, status: "available", source: "git", revision: target, scope: "Committed conceptual diagram comparison", limitations: model.guardrail.diagnostics } : { ...section, scope: "Conceptual model", limitations: ["No supported committed conceptual model was collected."] },
    },
  };
  const output = path.resolve(opts["--output"] ?? path.join(scope.repository, ".pi-verify"));
  const paths = await writeReportBundle(output, { goal: "Standalone review", verdict: "UNKNOWN", source: { branch: scope.branch }, review });
  const stateDir = path.join(scope.repository, ".pi-verify");
  await mkdir(stateDir, { recursive: true });
  await writeFile(path.join(stateDir, "latest-report.txt"), paths.htmlPath + "\n");
  console.log(`Report: ${paths.htmlPath}`);
  if (!scope.clean) console.log(`Excluded working-tree changes: ${scope.staged.length} staged, ${scope.unstaged.length} unstaged, ${scope.untracked.length} untracked.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
