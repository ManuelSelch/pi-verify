import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { importCoverage, unifiedDiff } from "../src/review-report/infra/coverage.js";
import { coverageHtml } from "../src/review-report/ui/coverage-html.js";

const configNames = ["package.json", "package-lock.json", "npm-shrinkwrap.json", "tsconfig.json", "jest.config.ts", "jest.config.js", "jest.config.cjs", "jest.config.mjs", "jest.config.json", "next.config.ts", "next.config.js", "next.config.cjs", "next.config.mjs"];

test("unifiedDiff numbers new-file lines and leaves deletions unnumbered", () => {
  const diff = ["@@ -1,3 +1,4 @@", " context", "-gone", "+added one", "+added two", " tail"].join("\n");
  assert.deepEqual(unifiedDiff(diff), [{ startLine: 1, lines: [
    { kind: "context", text: "context", line: 1 },
    { kind: "removed", text: "gone", line: null },
    { kind: "added", text: "added one", line: 2 },
    { kind: "added", text: "added two", line: 3 },
    { kind: "context", text: "tail", line: 4 },
  ] }]);
});

test("imported coverage carries the diff that introduced each uncovered changed line", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "verify-uncovered-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  writeFileSync(path.join(root, "source.ts"), "export const a = 1;\n"); git("add", "source.ts"); git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  const source = "export const a = 1;\nexport const b = 2;\n";
  writeFileSync(path.join(root, "source.ts"), source); git("commit", "-qam", "target");
  const head = git("rev-parse", "HEAD");
  const data = { schemaVersion: 1, collector: { name: "Supercov", version: "4.22.0" }, run: { id: "run_uncovered", exitCode: 0, command: ["npm", "test"], measuredAt: "now" }, comparison: { base, head, projectPath: "", workingTree: true }, stale: false, sources: { "source.ts": { source, sha256: createHash("sha256").update(source).digest("hex") } }, tests: [], setups: [], deletedTests: [], limitations: [], changedLines: [{ file: "source.ts", line: 2, status: "uncovered", coveringTests: [], context: { file: "source.ts", startLine: 1, endLine: 2, source } }] };
  const report = path.join(root, "coverage.json");
  writeFileSync(report, JSON.stringify(data));
  writeFileSync(path.join(root, "supercov-evidence.json"), JSON.stringify({ runId: "run_uncovered", base, head, projectPath: "", configurationHashes: Object.fromEntries(configNames.map(name => [name, null])) }));

  const imported = await importCoverage(root, report, base, head);
  assert.deepEqual(imported.changedDiffs?.["source.ts"], [{ startLine: 1, lines: [
    { kind: "context", text: "export const a = 1;", line: 1 },
    { kind: "added", text: "export const b = 2;", line: 2 },
  ] }]);

  const html = coverageHtml(imported);
  assert.match(html, /Uncovered changed lines · 1/);
  assert.match(html, /class="coverage-diff"/);
  assert.match(html, /<div class="diff-added uncovered">/);
  assert.match(html, /aria-label="Uncovered changed line">\+/);
  assert.doesNotMatch(html, /function-context">/);
});
