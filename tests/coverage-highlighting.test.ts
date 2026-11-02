import test from "node:test";
import assert from "node:assert/strict";
import { coverageHtml } from "../src/review-report/ui/coverage-html.js";
import type { CoverageReport } from "../src/review-report/infra/coverage.js";
import { highlightDiff, highlightLines, highlightSource } from "../src/review-report/ui/highlight.js";

const textOf = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[entity]!);

test("highlighting preserves line endings and independently lexes diff sides", () => {
  for (const separator of ["\n", "\r\n", "\r"]) {
    const source = `\tconst a: number = 1;${separator}${separator}const b = 2;${separator}`;
    assert.equal(textOf(highlightSource(source)), source);
  }
  const lines = [
    { kind: "removed", text: "/* old comment" }, { kind: "removed", text: "ends */" },
    { kind: "added", text: "const n: number = 1;" }, { kind: "context", text: "consume(n);" },
  ];
  const result = highlightDiff(lines);
  assert.deepEqual(result.map(textOf), lines.map(line => line.text));
  assert.equal(result[2], highlightLines("const n: number = 1;\nconsume(n);")[0]);
});

test("coverage source, diff, hits and gaps retain safe TypeScript syntax colors", () => {
  const source = 'const value: string = "<script>";';
  const context = { file: "src/example.ts", startLine: 1, endLine: 1, source };
  const report: CoverageReport = {
    schemaVersion: 1, collector: { name: "Supercov", version: "4.22.0" },
    run: { id: "run_1", exitCode: 0, command: ["npm", "test"], measuredAt: "now" },
    comparison: { base: "a", head: "b", workingTree: true }, stale: false, sources: {},
    tests: [{ id: "1", name: "safe", file: "tests/example.ts", line: 1, source, change: "modified", outcome: "passed", attribution: "exact", diff: [{ kind: "removed", text: 'const old = "old";' }, { kind: "added", text: source }], changedHits: [{ file: "src/example.ts", line: 1 }] }],
    changedLines: [{ file: "src/example.ts", line: 1, status: "covered", context }, { file: "src/example.ts", line: 2, status: "uncovered", context }], setups: [], deletedTests: [], limitations: [],
  };

  const html = coverageHtml(report);

  assert.ok((html.match(/data-syntax="typescript"/g) ?? []).length >= 4);
  assert.match(html, /<span style="color:#[A-Fa-f0-9]+/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /class="diff-added"/);
  assert.match(html, /class="diff-removed"/);
  assert.match(html, /Show changed-code hits/);
  assert.match(html, /uncovered changed line/);
});
