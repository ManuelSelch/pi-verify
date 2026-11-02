import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { changedLineNumbers, diffLines, functionContext, testDefinitions } from "./analysis.ts";
import type { ChangedLine, Location, Report, TestEvidence } from "./model.ts";

const exec = promisify(execFile);
const binary = fileURLToPath(new URL("../node_modules/.bin/supercov", import.meta.url));
const maxBuffer = 20 * 1024 * 1024;
export interface Options {
  root: string;
  base: string;
  sourceFiles: string[];
  testFiles: string[];
  outputDirectory: string;
}
interface RawTest {
  id: string;
  name: string;
  file: string;
  outcome: string;
  role: string;
  attribution: string;
  lines: Location[];
  totals: { lines: number };
}
interface Envelope {
  schemaVersion: number;
  ok: boolean;
  data: Record<string, unknown>;
  pagination?: { hasMore: boolean; nextOffset: number | null };
}
interface LineEvidence { totalAnchored: number; covered: boolean; tests: { id: string }[]; limitations: unknown[] }
export interface Measurement {
  options: Options;
  base: string;
  head: string;
  runId: string;
  exitCode: number;
  measuredAt: string;
  snapshots: Record<string, { sha256: string; source: string }>;
  configurationHashes: Record<string, string | null>;
  before: Record<string, string>;
  changed: Record<string, number[]>;
  rawTests: RawTest[];
  rawLines: Record<string, LineEvidence>;
  summary: Record<string, unknown>;
}

export function sha256(source: string): string { return createHash("sha256").update(source).digest("hex"); }
const configurationFiles = ["package.json", "package-lock.json", "npm-shrinkwrap.json", "tsconfig.json"];
async function configurationHashes(root: string): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const file of configurationFiles) {
    try { result[file] = sha256(await readFile(path.join(root, file), "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      result[file] = null;
    }
  }
  return result;
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function parseEnvelope(text: string): Envelope {
  const value: unknown = JSON.parse(text);
  if (!object(value) || value.schemaVersion !== 1 || value.ok !== true || !object(value.data))
    throw new Error("Supercov returned an unsupported or unsuccessful JSON response");
  return value as unknown as Envelope;
}
async function query(root: string, args: string[]): Promise<Envelope> {
  const result = await exec(binary, args, { cwd: root, timeout: 30000, maxBuffer });
  return parseEnvelope(result.stdout);
}
async function git(root: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd: root, timeout: 10000, maxBuffer })).stdout;
}
function validatePath(file: string): void {
  if (path.isAbsolute(file) || file.split(/[\\/]/).includes("..") || file.startsWith("-"))
    throw new Error(`Expected a project-relative path: ${file}`);
}
async function baseSource(root: string, revision: string, file: string): Promise<string> {
  const listed = await git(root, "ls-tree", "--name-only", revision, "--", file);
  if (!listed.trim()) return "";
  return git(root, "show", `${revision}:${file}`);
}
function rawTest(value: unknown): RawTest {
  if (!object(value) || !["id", "name", "file", "outcome", "role", "attribution"].every(key => typeof value[key] === "string") || !Array.isArray(value.lines) || !object(value.totals) || typeof value.totals.lines !== "number")
    throw new Error(`Supercov individual-test response is missing identity, outcome, role or coverage: ${JSON.stringify(value)}`);
  for (const line of value.lines)
    if (!object(line) || typeof line.file !== "string" || !Number.isInteger(line.line)) throw new Error("Invalid source location");
  if (value.lines.length !== value.totals.lines) throw new Error("Supercov test coverage was truncated");
  return value as unknown as RawTest;
}

export async function measure(options: Options): Promise<Measurement> {
  const root = path.resolve(options.root);
  const outputDirectory = path.resolve(options.outputDirectory);
  options = { ...options, root, outputDirectory };
  const files = [...new Set([...options.sourceFiles, ...options.testFiles, "package.json"])];
  for (const file of files) validatePath(file);
  const base = (await git(root, "rev-parse", "--verify", `${options.base}^{commit}`)).trim();
  const head = (await git(root, "rev-parse", "HEAD")).trim();
  await mkdir(outputDirectory, { recursive: true });
  const configHashes = await configurationHashes(root);
  const snapshots: Measurement["snapshots"] = {};
  const before: Record<string, string> = {};
  const changed: Record<string, number[]> = {};
  for (const file of files) {
    const source = await readFile(path.join(root, file), "utf8");
    snapshots[file] = { source, sha256: sha256(source) };
    before[file] = await baseSource(root, base, file);
    const tracked = (await git(root, "ls-tree", "--name-only", base, "--", file)).trim();
    changed[file] = tracked
      ? changedLineNumbers(await git(root, "diff", "--no-ext-diff", "--no-textconv", "--unified=0", base, "--", file))
      : source.split("\n").map((_, index) => index + 1);
  }
  const idFile = path.join(outputDirectory, "run-id.txt");
  await rm(idFile, { force: true });
  let stdout = "", stderr = "", exitCode = 0;
  // This is a new runner invocation, not a child task in our own node:test suite.
  const environment: NodeJS.ProcessEnv = { ...process.env, SUPERCOV_RUN_ID_FILE: idFile };
  delete environment.NODE_TEST_CONTEXT;
  try {
    const result = await exec(binary, ["--", "npm", "test"], {
      cwd: root, timeout: 120000, maxBuffer,
      env: environment,
    });
    stdout = result.stdout; stderr = result.stderr;
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string; killed?: boolean };
    stdout = failure.stdout ?? ""; stderr = failure.stderr ?? "";
    await writeFile(path.join(outputDirectory, "measurement.stdout.log"), stdout);
    await writeFile(path.join(outputDirectory, "measurement.stderr.log"), stderr);
    if (failure.killed || typeof failure.code !== "number") throw new Error(`Supercov launch/timeout failure: ${String(error)}`);
    exitCode = failure.code;
  }
  await writeFile(path.join(outputDirectory, "measurement.stdout.log"), stdout);
  await writeFile(path.join(outputDirectory, "measurement.stderr.log"), stderr);
  const runId = (await readFile(idFile, "utf8")).trim();
  if (!/^run_[a-zA-Z0-9_-]+$/.test(runId)) throw new Error("Supercov did not record a valid immutable run ID");
  const summary = (await query(root, ["runs", runId, "--json"])).data;
  if (summary.testExitCode !== exitCode) throw new Error("Collector and measured test exit codes disagree");
  const version = (await exec(binary, ["--version"], { timeout: 10000 })).stdout;
  if (!version.startsWith("supercov 4.22.0 ")) throw new Error("This spike expects pinned Supercov 4.22.0");
  const entries: unknown[] = [];
  let offset = 0;
  // An empty fragment is Supercov's list-all-tests query; follow pagination explicitly.
  while (true) {
    const page = await query(root, ["runs", runId, "test", "", "--limit", "0", "--offset", String(offset), "--json"]);
    if (!Array.isArray(page.data.tests)) throw new Error("Supercov test inventory missing");
    entries.push(...page.data.tests);
    if (!page.pagination?.hasMore) break;
    const next = page.pagination.nextOffset;
    if (next === null || next <= offset) throw new Error("Non-progressing test pagination");
    offset = next;
  }
  const rawTests: RawTest[] = [];
  for (const entry of entries) {
    if (!object(entry) || typeof entry.id !== "string") throw new Error("Invalid test inventory entry");
    const page = await query(root, ["runs", runId, "test", entry.id, "--limit", "0", "--json"]);
    if (page.pagination?.hasMore) throw new Error("Individual-test evidence exceeds the query limit; refusing partial attribution");
    if (!Array.isArray(page.data.tests) || page.data.tests.length !== 1) throw new Error("Individual test identity is ambiguous");
    rawTests.push(rawTest(page.data.tests[0]));
  }
  const rawLines: Record<string, LineEvidence> = {};
  for (const file of options.sourceFiles) {
    for (const line of changed[file]) {
      const page = await query(root, ["runs", runId, "line", `${file}:${line}`, "--limit", "0", "--json"]);
      const data = page.data;
      if (page.pagination?.hasMore || typeof data.totalAnchored !== "number" || typeof data.covered !== "boolean" || !Array.isArray(data.tests) || !Array.isArray(data.limitations))
        throw new Error("Incomplete changed-line evidence");
      rawLines[`${file}:${line}`] = data as unknown as LineEvidence;
    }
  }
  const measuredAt = typeof summary.generatedAt === "string" ? summary.generatedAt : new Date().toISOString();
  const measurement = { options, base, head, runId, exitCode, measuredAt, snapshots, configurationHashes: configHashes, before, changed, rawTests, rawLines, summary };
  await writeFile(path.join(outputDirectory, "supercov-evidence.json"), JSON.stringify(measurement, null, 2));
  return measurement;
}

export async function buildReport(measurement: Measurement): Promise<Report> {
  const { options, snapshots } = measurement;
  const limitations = [
    "Spike scope: explicit source/test file allowlists; TypeScript node:test static test()/it()/describe() declarations only. Not a universal runner adapter.",
    "Coverage is observed execution, not assertion strength, all inputs, or proof that a selected subset is safe to run.",
    "Base comparison classifies test-definition text; renamed tests appear as removed plus added. Shared setup/helper/import changes are disclosed separately, not assigned to every test.",
    "Deleted source lines are not measured at head. Non-executable changed lines are excluded from coverage gaps. A base coverage run is required for deleted-code impact.",
  ];
  let stale = measurement.summary.stale === true;
  const currentConfiguration = await configurationHashes(options.root);
  if (Object.keys(currentConfiguration).some(file => currentConfiguration[file] !== measurement.configurationHashes[file])) stale = true;
  for (const [file, snapshot] of Object.entries(snapshots)) {
    try { if (sha256(await readFile(path.join(options.root, file), "utf8")) !== snapshot.sha256) stale = true; }
    catch { stale = true; }
  }
  if ((await git(options.root, "rev-parse", "HEAD")).trim() !== measurement.head) stale = true;
  if (stale) limitations.push("STALE: source, tests, configuration or HEAD changed after collection. Current changed-line attribution is withheld; embedded sources are measurement-time snapshots.");
  if (measurement.summary.measurement && object(measurement.summary.measurement) && measurement.summary.measurement.complete !== true)
    limitations.push("Supercov reports incomplete measurement; changed-line gaps are unknown.");
  const tests: TestEvidence[] = [], setups: TestEvidence[] = [];
  const deletedTests: Report["deletedTests"] = [];
  const matched = new Set<string>();
  for (const raw of measurement.rawTests) {
    const current = snapshots[raw.file] ? testDefinitions(raw.file, snapshots[raw.file].source) : [];
    const previous = testDefinitions(raw.file, measurement.before[raw.file] ?? "");
    const matches = current.filter(item => item.name === raw.name);
    const prior = previous.filter(item => item.name === raw.name);
    const definition = matches.length === 1 ? matches[0] : undefined;
    const old = prior.length === 1 ? prior[0] : undefined;
    const exact = !stale && raw.attribution === "exact";
    const change = definition ? old ? definition.source === old.source ? "unchanged" : "modified" : prior.length ? "unknown" : "added" : "unknown";
    const item: TestEvidence = {
      id: raw.id, name: raw.name, file: raw.file, line: definition?.line ?? null,
      source: definition?.source ?? null, change,
      diff: definition ? diffLines(old?.source ?? "", definition.source) : [],
      outcome: raw.outcome, attribution: stale ? "stale" : raw.attribution,
      executedLines: raw.lines,
      changedHits: exact && raw.role === "test" ? raw.lines.filter(location => options.sourceFiles.includes(location.file) && measurement.changed[location.file]?.includes(location.line)) : [],
    };
    if (raw.role === "setup") setups.push(item);
    else if (raw.role === "test") {
      tests.push(item);
      matched.add(`${raw.file}\0${raw.name}`);
      if (!definition) limitations.push(`Cannot unambiguously recover test source: ${raw.file} / ${raw.name}`);
      if (!exact && !stale) limitations.push(`Per-test attribution is ${raw.attribution}: ${raw.name}`);
    } else limitations.push(`Unsupported evidence role ${raw.role}: ${raw.name}`);
  }
  for (const file of options.testFiles) {
    const current = testDefinitions(file, snapshots[file].source);
    const previous = testDefinitions(file, measurement.before[file]);
    const names = new Set(current.map(item => item.name));
    for (const old of previous)
      if (!names.has(old.name)) deletedTests.push({ file, name: old.name, source: old.source });
    for (const definition of current) {
      if (matched.has(`${file}\0${definition.name}`)) continue;
      const old = previous.find(item => item.name === definition.name);
      tests.push({
        id: `unmeasured:${file}:${definition.line}`, name: definition.name, file, line: definition.line,
        source: definition.source, change: old ? old.source === definition.source ? "unchanged" : "modified" : "added",
        diff: diffLines(old?.source ?? "", definition.source), outcome: "unknown", attribution: "unavailable", executedLines: [], changedHits: [],
      });
      limitations.push(`Static test has no collector evidence: ${file} / ${definition.name}`);
    }
    // Remove recognized test bodies before comparing file-level setup/import text.
    const remainder = (text: string) => {
      for (const item of testDefinitions(file, text)) text = text.replace(item.source, "");
      return text.replace(/\s+/g, "");
    };
    if (remainder(snapshots[file].source) !== remainder(measurement.before[file]))
      limitations.push(`Shared test context/imports/helpers changed: ${file}. No per-test impact inference is made.`);
  }
  if (setups.length) limitations.push(`${setups.length} setup records are stored separately and excluded from test-body changed-code hits.`);
  const uncertain = tests.some(item => item.attribution !== "exact") || object(measurement.summary.measurement) && measurement.summary.measurement.complete !== true;
  const changedLines: ChangedLine[] = [];
  for (const file of options.sourceFiles) {
    for (const line of measurement.changed[file]) {
      const raw = measurement.rawLines[`${file}:${line}`];
      const coveringTests = tests.filter(item => item.changedHits.some(hit => hit.file === file && hit.line === line)).map(item => item.id);
      const status = stale || raw.limitations.length ? "unknown" : coveringTests.length ? "covered" : uncertain ? "unknown" : raw.totalAnchored === 0 ? "not-executable" : raw.covered ? "unknown" : "uncovered";
      changedLines.push({ file, line, status, coveringTests, context: functionContext(file, snapshots[file].source, line) });
    }
  }
  return {
    schemaVersion: 1, collector: { name: "Supercov", version: "4.22.0" },
    run: { id: measurement.runId, exitCode: measurement.exitCode, command: ["npm", "test"], measuredAt: measurement.measuredAt },
    comparison: { base: measurement.base, head: measurement.head, workingTree: true },
    stale, sources: snapshots, tests, setups, changedLines, deletedTests, limitations,
  };
}
