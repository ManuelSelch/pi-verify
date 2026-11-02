import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
type Location = { file: string; line: number };
type Context = { file: string; startLine: number; endLine: number; source: string };
export type CoverageTest = { id: string; name: string; file: string; line: number | null; source: string | null; change: string; diff: { kind: string; text: string }[]; outcome: string; attribution: string; changedHits: Location[] };
export type CoverageReport = {
  schemaVersion: 1; collector: { name: string; version: string };
  run: { id: string; exitCode: number; command: string[]; measuredAt: string };
  comparison: { base: string; head: string; projectPath: string; workingTree: true }; stale: boolean;
  sources: Record<string, { source: string; sha256: string }>;
  tests: CoverageTest[]; setups: unknown[]; deletedTests: unknown[];
  changedLines: (Location & { status: string; context: Context })[]; limitations: string[];
};
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const stringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
const location = (v: unknown): v is Location => object(v) && typeof v.file === "string" && Number.isInteger(v.line) && v.line > 0;

// Only the neutral Supercov report is accepted, and every captured file must equal
// the committed target. This prevents a worktree measurement masquerading as HEAD.
export async function importCoverage(root: string, file: string, base: string, target: string): Promise<CoverageReport> {
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!object(value) || value.schemaVersion !== 1 || !object(value.collector) || value.collector.name !== "Supercov" || typeof value.collector.version !== "string" || !object(value.run) || typeof value.run.id !== "string" || typeof value.run.measuredAt !== "string" || !Number.isInteger(value.run.exitCode) || !stringArray(value.run.command) || !object(value.comparison) || value.comparison.workingTree !== true || typeof value.comparison.projectPath !== "string" || typeof value.stale !== "boolean" || !object(value.sources) || !Array.isArray(value.tests) || !Array.isArray(value.changedLines) || !Array.isArray(value.setups) || !Array.isArray(value.deletedTests) || !stringArray(value.limitations)) throw new Error("Unsupported or incomplete coverage report");
  if (value.stale) throw new Error("Coverage report is stale");
  const repository = (await exec("git", ["rev-parse", "--show-toplevel"], { cwd: root })).stdout.trim();
  const git = async (...args: string[]) => (await exec("git", args, { cwd: repository, maxBuffer: 20 * 1024 * 1024 })).stdout;
  const [resolvedBase, resolvedTarget] = await Promise.all([git("rev-parse", "--verify", `${base}^{commit}`), git("rev-parse", "--verify", `${target}^{commit}`)]);
  if (value.comparison.base !== resolvedBase.trim()) throw new Error("Coverage base does not match the review base");
  if (value.comparison.head !== resolvedTarget.trim()) throw new Error("Coverage target does not match the review target");
  let raw: unknown;
  try { raw = JSON.parse(await readFile(path.join(path.dirname(file), "supercov-evidence.json"), "utf8")); }
  catch { throw new Error("Coverage raw evidence is missing or invalid"); }
  if (!object(raw) || raw.runId !== value.run.id || raw.base !== value.comparison.base || raw.head !== value.comparison.head || raw.projectPath !== value.comparison.projectPath || !object(raw.configurationHashes)) throw new Error("Coverage raw evidence does not match the report");
  const projectPath = value.comparison.projectPath as string;
  if (path.isAbsolute(projectPath) || projectPath.startsWith("-") || projectPath.split(/[\\/]/).includes("..")) throw new Error("Invalid coverage project path");
  const inRepository = (file: string) => projectPath ? `${projectPath}/${file}` : file;
  for (const config of ["package.json", "package-lock.json", "npm-shrinkwrap.json", "tsconfig.json", "jest.config.ts", "jest.config.js", "jest.config.cjs", "jest.config.mjs", "jest.config.json", "next.config.ts", "next.config.js", "next.config.cjs", "next.config.mjs"]) {
    if (!(config in raw.configurationHashes)) throw new Error(`Coverage configuration hash missing: ${config}`);
    const repoPath = inRepository(config);
    const listed = (await git("ls-tree", "--name-only", resolvedTarget.trim(), "--", repoPath)).trim();
    const contents = listed === repoPath ? await git("show", `${resolvedTarget.trim()}:${repoPath}`) : null;
    const hash = contents === null ? null : createHash("sha256").update(contents).digest("hex");
    if (hash !== raw.configurationHashes[config]) throw new Error(`Coverage configuration differs from committed target: ${config}`);
  }
  const entries = Object.entries(value.sources);
  if (!entries.length) throw new Error("Coverage contains no source snapshots");
  for (const [filePath, snapshot] of entries) {
    if (!filePath || filePath.startsWith("-") || filePath.startsWith("/") || filePath.split(/[\\/]/).includes("..") || !object(snapshot) || typeof snapshot.source !== "string" || typeof snapshot.sha256 !== "string") throw new Error("Invalid coverage source snapshot");
    if (createHash("sha256").update(snapshot.source).digest("hex") !== snapshot.sha256) throw new Error(`Coverage snapshot checksum differs: ${filePath}`);
    let committed: string;
    try { committed = await git("show", `${resolvedTarget.trim()}:${inRepository(filePath)}`); }
    catch { throw new Error(`Coverage snapshot is not in committed target: ${filePath}`); }
    if (snapshot.source !== committed) throw new Error(`Coverage snapshot differs from committed target: ${filePath}`);
  }
  for (const t of value.tests) {
    if (!object(t) || ![t.id,t.name,t.file,t.change,t.outcome,t.attribution].every(x => typeof x === "string") || !(t.line === null || Number.isInteger(t.line)) || !(t.source === null || typeof t.source === "string") || !Array.isArray(t.changedHits) || !t.changedHits.every(location) || !Array.isArray(t.diff) || !t.diff.every((d: unknown) => object(d) && ["added", "removed", "context"].includes(d.kind) && typeof d.text === "string")) throw new Error("Invalid coverage test evidence");
  }
  for (const line of value.changedLines) {
    if (!object(line) || !["covered", "uncovered", "unknown", "not-executable"].includes(line.status) || !object(line.context) || typeof line.context.file !== "string" || typeof line.context.source !== "string" || !Number.isInteger(line.context.startLine) || !Number.isInteger(line.context.endLine) || !location(line)) throw new Error("Invalid changed-line evidence");
  }
  return value as unknown as CoverageReport;
}
