import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { importCoverage } from "../src/review-report/infra/coverage.js";

const configNames = ["package.json", "package-lock.json", "npm-shrinkwrap.json", "tsconfig.json", "jest.config.ts", "jest.config.js", "jest.config.cjs", "jest.config.mjs", "jest.config.json", "next.config.ts", "next.config.js", "next.config.cjs", "next.config.mjs"];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

test("imports a Jest report from a committed monorepo frontend and rejects config drift", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "verify-monorepo-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, "frontend"), output = path.join(root, "output");
  mkdirSync(path.join(project, "src"), { recursive: true }); mkdirSync(output);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  const source = "export const value = 1;\n", config = "module.exports = {};\n";
  writeFileSync(path.join(project, "src/value.ts"), source); writeFileSync(path.join(project, "jest.config.cjs"), config);
  git("add", "frontend"); git("commit", "-qm", "base");
  const head = git("rev-parse", "HEAD"), runId = "run_jest";
  const report = { schemaVersion: 1, collector: { name: "Supercov", version: "4.22.0" }, run: { id: runId, exitCode: 0, command: ["npm", "test"], measuredAt: "now" }, comparison: { base: head, head, projectPath: "frontend", workingTree: true }, stale: false, sources: { "src/value.ts": { source, sha256: hash(source) } }, tests: [], setups: [], deletedTests: [], changedLines: [], limitations: [] };
  const configurationHashes = Object.fromEntries(configNames.map(name => [name, name === "jest.config.cjs" ? hash(config) : null]));
  const evidence = { runId, base: head, head, projectPath: "frontend", configurationHashes };
  const reportPath = path.join(output, "report.json");
  writeFileSync(reportPath, JSON.stringify(report)); writeFileSync(path.join(output, "supercov-evidence.json"), JSON.stringify(evidence));

  const imported = await importCoverage(root, reportPath, head, head);
  assert.equal(imported.comparison.projectPath, "frontend");
  evidence.configurationHashes["jest.config.cjs"] = hash("changed");
  writeFileSync(path.join(output, "supercov-evidence.json"), JSON.stringify(evidence));
  await assert.rejects(importCoverage(root, reportPath, head, head), /configuration differs/);
});
