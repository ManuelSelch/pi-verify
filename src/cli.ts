#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { collectGitScope, type GitScope } from "./git-scope.js";
import { collectArchitecture } from "./architecture/collect.js";
import { checkWorkingTree } from "./architecture/check.js";
import { writeArchitectureDiagram } from "./architecture/write.js";
import { resolveArchitectureWorkspace } from "./architecture/workspace.js";
import { importCoverage, type CoverageReport } from "./review-report/infra/coverage.js";
import { writeReportBundle } from "./report.js";
import type { ReviewReport, ReviewSection } from "./review-report/domain/model.js";

const exec = promisify(execFile);
const usage = `Usage: pi-verify collect-coverage [--base REF] [--root DIR] [--source DIR]... [--test DIR]... [--output DIR]
       pi-verify review [--base REF] [--target REF] [--output DIR] [--coverage-report FILE]
       pi-verify preview [--output DIR]
       pi-verify architecture [--write] [--accept]`;

function options(args: string[], allowed: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!allowed.includes(key) || result[key] || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Invalid option: ${key}\n${usage}`);
    result[key] = args[++i];
  }
  return result;
}

async function comparison(scope: GitScope, baseOption?: string, targetOption?: string) {
  const git = async (...argv: string[]) => (await exec("git", argv, { cwd: scope.repository })).stdout.trim();
  const target = await git("rev-parse", "--verify", `${targetOption ?? "HEAD"}^{commit}`);
  const selected = baseOption ?? (scope.baselineMethod === "branch-creation-reflog" ? scope.baseline : null);
  if (!selected) throw new Error("Branch creation base is unavailable; specify --base REF.");
  const base = await git("rev-parse", "--verify", `${selected}^{commit}`);
  if (!baseOption) {
    try { await git("merge-base", "--is-ancestor", base, target); }
    catch { throw new Error("Branch creation base is not an ancestor of target; specify --base REF."); }
  }
  return { base, target, tree: await git("rev-parse", `${target}^{tree}`) };
}

async function checkArchitectureOnWorkingTree(write: boolean, accept: boolean) {
  const workspace = await resolveArchitectureWorkspace(process.cwd());
  if (!workspace) throw new Error("Architecture is not configured: no .pi/pi-verify.json found.");
  const { base, configuration } = workspace;
  if (write || accept) {
    const result = writeArchitectureDiagram(base, configuration, { accept });
    console.log(result.changed
      ? `Updated ${configuration.diagram}: +${result.addedSlices.length}/-${result.removedSlices.length} slices, +${result.addedEdges.length}/-${result.removedEdges.length} arrows.`
      : `${configuration.diagram} is already current.`);
    if (accept) console.log("Accepted the current placement.");
    else if (result.stagedSlices.length) console.log(`Awaiting human placement: ${result.stagedSlices.join(", ")}`);
  }
  const { errors, unused } = checkWorkingTree(base, configuration);
  if (unused.length) console.log(`Allowed but unused: ${unused.join(", ")}`);
  if (errors.length) throw new Error(`Architecture check failed:\n${errors.map(error => `- ${error}`).join("\n")}`);
  console.log("Architecture: OK");
}

async function collectCoverage(args: string[]) {
  const allowed = ["--base", "--root", "--source", "--test", "--output"];
  const values = new Map<string, string[]>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!allowed.includes(key) || !value || value.startsWith("--")) throw new Error(`Invalid option: ${key}\n${usage}`);
    if (key !== "--source" && key !== "--test" && values.has(key)) throw new Error(`Specify ${key} only once.`);
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 18)) throw new Error("Coverage collection requires Node.js 22.18 or later.");
  const root = path.resolve(values.get("--root")?.[0] ?? process.cwd());
  const scope = await collectGitScope(root);
  const { base } = await comparison(scope, values.get("--base")?.[0]);
  const files = (await exec("git", ["ls-files", "-z", "--", "."], { cwd: root, maxBuffer: 10 * 1024 * 1024 })).stdout.split("\0").filter(Boolean);
  const isTest = (file: string) => /(^|\/)(__tests__|tests?|specs?)\//i.test(file) || /\.(test|spec)\.[cm]?tsx?$/i.test(file);
  const typescript = (file: string) => /\.[cm]?tsx?$/i.test(file) && !/\.d\.[cm]?ts$/i.test(file);
  const projectRoot = await realpath(root);
  const directories = async (names: string[]) => Promise.all(names.map(async name => {
    if (path.isAbsolute(name) || name.split(/[\\/]/).includes("..")) throw new Error(`Expected a project-relative directory: ${name}`);
    const directory = path.resolve(root, name);
    let resolved: string;
    try { resolved = await realpath(directory); }
    catch { throw new Error(`Directory not found: ${name}`); }
    if (!(await stat(resolved)).isDirectory()) throw new Error(`Not a directory: ${name}`);
    const relative = path.relative(projectRoot, resolved);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Expected a directory inside the project: ${name}`);
    return relative.split(path.sep).join("/") + "/";
  }));
  const sourceDirs = await directories(values.get("--source") ?? ["src"]);
  const testDirs = await directories(values.get("--test") ?? ["tests"]);
  const sources = files.filter(file => sourceDirs.some(dir => file.startsWith(dir)) && typescript(file) && !isTest(file));
  const tests = files.filter(file => testDirs.some(dir => file.startsWith(dir)) && typescript(file));
  if (!sources.length || !tests.length) throw new Error("No tracked TypeScript source or test files found in the selected directories.");
  const output = path.resolve(values.get("--output")?.[0] ?? path.join(scope.repository, ".pi-verify", "coverage"));
  await mkdir(output, { recursive: true });
  await rm(path.join(output, "report.json"), { force: true });
  console.log(`Running npm test through Supercov in ${root}. Sources: ${sources.length}; tests: ${tests.length}.`);
  let collector: typeof import("./coverage/collector.js");
  try { collector = await import("./coverage/collector.js"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
    throw new Error("Supercov is not installed; reinstall pi-verify with optional dependencies enabled.");
  }
  const measurement = await collector.measure({ root, base, sourceFiles: sources, testFiles: tests, outputDirectory: output });
  const report = await collector.buildReport(measurement);
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Coverage: ${path.join(output, "report.json")} (test exit ${report.run.exitCode}; stale: ${report.stale})`);
  if (report.run.exitCode !== 0) process.exitCode = report.run.exitCode;
  else if (report.stale) process.exitCode = 2;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") { console.log(usage); return; }
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) { console.log(usage); return; }
  if (command === "collect-coverage") { await collectCoverage(args); return; }
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
  if (command === "architecture") {
    const unknown = args.filter(arg => arg !== "--write" && arg !== "--accept");
    if (unknown.length) throw new Error(`Invalid option: ${unknown[0]}\n${usage}`);
    const accept = args.includes("--accept");
    await checkArchitectureOnWorkingTree(args.includes("--write") || accept, accept);
    return;
  }
  if (command !== "review") throw new Error(`Unknown command: ${command}\n${usage}`);
  const opts = options(args, ["--base", "--target", "--output", "--coverage-report"]);
  const scope = await collectGitScope(process.cwd());
  const { base, target, tree } = await comparison(scope, opts["--base"], opts["--target"]);
  const architecture = await collectArchitecture(scope.repository, base, target);
  const defaultCoverage = path.join(scope.repository, ".pi-verify", "coverage", "report.json");
  let coverage: CoverageReport | undefined;
  if (opts["--coverage-report"]) coverage = await importCoverage(scope.repository, path.resolve(opts["--coverage-report"]), base, target);
  else {
    let available = true;
    try { await access(defaultCoverage); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") available = false; else throw error; }
    // A later commit that leaves the measured sources, tests and configuration unchanged
    // keeps the evidence valid; any other mismatch is ignored rather than blocking review.
    if (available) {
      try { coverage = await importCoverage(scope.repository, defaultCoverage, base, target, { requireMatchingComparison: false }); }
      catch (error) { console.error(`Coverage not imported: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
  const section: ReviewSection = { status: "unavailable", source: "not-collected", scope: "Not collected in standalone review", revision: null, limitations: ["Not collected in this standalone review."], evidence: [] };
  const hasArchitecture = !!architecture && (architecture.basePresent || architecture.targetPresent);
  const review: ReviewReport = {
    schemaVersion: 1,
    ...(architecture && hasArchitecture ? { architecture } : {}),
    ...(coverage ? { coverage } : {}),
    comparison: { status: "available", base, target, targetTree: tree, method: opts["--base"] ? "explicit" : "branch-creation-reflog", includesUncommitted: false, excludedWorkingTree: { staged: scope.staged, unstaged: scope.unstaged, untracked: scope.untracked }, limitations: ["Working tree changes are excluded."] },
    sections: {
      overview: section, changes: section, complexity: section, evidence: section,
      testsCoverage: coverage ? { ...section, status: "available", source: "coverage-collector", revision: target, scope: "Imported per-test coverage", limitations: coverage.limitations } : { ...section, scope: "Per-test coverage", limitations: ["No coverage report supplied."] },
      architecture: hasArchitecture ? { ...section, status: "available", source: "git", revision: target, scope: "Committed architecture diagram comparison", limitations: architecture ? architecture.guardrail.diagnostics : [] } : { ...section, scope: "Architecture", limitations: ["No committed architecture diagram found."] },
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
