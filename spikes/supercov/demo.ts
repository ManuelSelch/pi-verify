import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Fixture } from "./tests/fixture.ts";
import { measure, buildReport } from "./src/collector.ts";
import { writeReport } from "./src/report.ts";

const directory = fileURLToPath(new URL("./output/", import.meta.url));
await mkdir(directory, { recursive: true });
const output = await mkdtemp(path.join(directory, "run-"));
const results = [];
for (const scenario of ["normal", "compiled", "overlap", "failure", "stale"] as const) {
  const artifacts = path.join(output, scenario);
  const fixture = new Fixture();
  await fixture.prepare(scenario === "stale" ? "normal" : scenario, path.join(artifacts, "fixture"));
  const measurement = await measure({ root: fixture.directory, base: "HEAD", sourceFiles: ["src/pricing.ts"], testFiles: ["tests/pricing.test.ts"], outputDirectory: artifacts });
  if (scenario === "stale") await fixture.editSource();
  const report = await buildReport(measurement);
  await writeReport(report, artifacts);
  const result = {
    scenario, run: report.run.id, testExitCode: report.run.exitCode, stale: report.stale,
    tests: report.tests.length, setups: report.setups.length,
    outcomes: report.tests.map(item => ({ name: item.name, outcome: item.outcome, attribution: item.attribution })),
    changedTests: report.tests.filter(item => ["added", "modified"].includes(item.change)).length,
    coveringTests: report.tests.filter(item => item.changedHits.length).length,
    uncoveredChangedLines: report.changedLines.filter(item => item.status === "uncovered").length,
  };
  results.push(result);
  console.log(`${scenario}: ${result.tests} tests, ${result.setups} setups, test exit ${result.testExitCode}, stale=${result.stale}`);
}
await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
await writeFile(path.join(output, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Supercov spike runs</title><body style="font:15px/1.8 system-ui;max-width:760px;margin:40px auto;padding:0 20px"><h1>Supercov TypeScript spike</h1><p>Real measured fixtures; the failure and stale examples are deliberate.</p><ul>${results.map(result => `<li><a href="${result.scenario}/index.html">${result.scenario}</a> — ${result.tests} tests · ${result.setups} setups · exit ${result.testExitCode}${result.stale ? " · STALE" : ""}</li>`).join("")}</ul><p><a href="results.json">Run summaries (JSON)</a></p></body></html>`);
console.log(`\nReport: ${path.join(output, "index.html")}`);
console.log("Fixtures, raw collector evidence, logs, source snapshots and reports are retained under this ignored run directory.");
