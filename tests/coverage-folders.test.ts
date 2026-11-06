import test from "node:test";
import assert from "node:assert/strict";
import { coverageCss, coverageHtml } from "../src/review-report/ui/coverage-html.js";
import type { CoverageReport, CoverageTest } from "../src/review-report/infra/coverage.js";

function evidence(file: string, overrides: Partial<CoverageTest> = {}): CoverageTest {
  return { id: file, file, name: `test in ${file}`, line: 12, source: "assert.ok(true);", change: "modified", diff: [], outcome: "passed", attribution: "exact", changedHits: [{ file: "src/a.ts", line: 1 }], ...overrides };
}
function report(tests: CoverageTest[]): CoverageReport {
  return { schemaVersion: 1, collector: { name: "Supercov", version: "1" }, run: { id: "1", exitCode: 0, command: ["npm", "test"], measuredAt: "now" }, comparison: { base: "a", head: "b", projectPath: "", workingTree: true }, stale: false, sources: {}, tests, setups: [], deletedTests: [], changedLines: [], limitations: [] };
}
function allPanel(html: string): string { return html.split('<div class="all-panel">')[1].split('</div></div></div>')[0]; }

test("individual test rows are compact and borderless without changing group spacing", () => {
  assert.match(coverageCss, /\.coverage-row>summary\{cursor:pointer;padding:6px 4px\}/);
  assert.doesNotMatch(coverageCss, /[^{}]*\.coverage-row[^{}]*\{[^}]*border/);
  assert.match(coverageCss, /\.coverage-folder>summary,\.coverage-file>summary\{cursor:pointer;padding:12px 4px/);
  assert.match(coverageCss, /\.coverage-gaps\{border-top:1px solid #e9f0ec\}/);
});

test("colocated tests have just owning-folder and file groups, with test directories omitted", () => {
  const html = allPanel(coverageHtml(report([
    evidence("src/features/calendar/__tests__/integration/calendar.test.ts"),
    evidence("src/features/calendar/__tests__/availability.test.ts"),
    evidence("src/features/calendar/adapters/tests/caldav.test.ts"),
  ])));

  assert.match(html, /data-folder="src\/features\/calendar"/);
  assert.match(html, /data-folder="src\/features\/calendar\/adapters"/);
  assert.match(html, /class="coverage-group-label">integration\/calendar.test.ts</);
  assert.doesNotMatch(html, /class="coverage-group-label">(?:src|features|__tests__|integration|tests)</);
  assert.equal((html.match(/class="coverage-folder"/g) ?? []).length, 2);
  assert.equal((html.match(/class="coverage-file"/g) ?? []).length, 3);
  assert.match(html, /src\/features\/calendar\/__tests__\/integration\/calendar.test.ts:12/);
});

test("shared tests and files without test directories retain distinct paths and stable ordering", () => {
  const html = allPanel(coverageHtml(report([
    evidence("tests/unit/example.test.ts"), evidence("src/foo.test.ts"),
    evidence("tests/integration/example.test.ts"), evidence("root.test.ts"),
  ])));

  assert.match(html, /data-folder="tests"/);
  assert.match(html, /class="coverage-group-label">unit\/example.test.ts</);
  assert.match(html, /class="coverage-group-label">integration\/example.test.ts</);
  assert.match(html, /data-folder="src"/);
  assert.match(html, /data-folder="\."/);
  assert.ok(html.indexOf('>integration/example.test.ts<') < html.indexOf('>unit/example.test.ts<'));
});

test("counts and outcomes belong to the current view and failures open only their ancestors", () => {
  const html = coverageHtml(report([
    evidence("src/a/__tests__/a.test.ts", { name: "passing" }),
    evidence("src/a/__tests__/a.test.ts", { name: "failure", outcome: "failed", changedHits: [], change: "unchanged" }),
    evidence("src/b/__tests__/b.test.ts", { outcome: "skipped" }),
  ]));
  const all = allPanel(html);

  assert.match(all, /class="coverage-folder" data-folder="src\/a" open/);
  assert.match(all, /class="coverage-file" data-file="src\/a\/__tests__\/a.test.ts" open/);
  assert.match(all, /2 tests · 1 failed · 1 passed/);
  assert.match(all, /class="coverage-folder" data-folder="src\/b">/);
  assert.match(all, /1 test · 1 skipped/);
  const covering = html.split('<div class="covering-panel">')[1].split('<div class="changed-panel">')[0];
  assert.doesNotMatch(covering, /data-folder="src\/a" open/);
  assert.doesNotMatch(covering, /1 failed/);
});

test("group and search metadata escapes untrusted paths, names and outcomes", () => {
  const html = coverageHtml(report([evidence('src/<img>/__tests__/a".test.ts', { name: '<script>alert(1)</script>', outcome: '<img src=x>' })]));

  assert.doesNotMatch(html, /<img|<script|oninput=/);
  assert.match(html, /data-folder="src\/&lt;img&gt;"/);
  assert.match(html, /data-search="[^"<>]*&lt;script&gt;/);
});

test("each view offers search and bulk group controls without replacing test evidence", () => {
  const html = coverageHtml(report([evidence("tests/example.test.ts")]));

  assert.equal((html.match(/type="search"/g) ?? []).length, 3);
  assert.equal((html.match(/data-expand="true"/g) ?? []).length, 3);
  assert.equal((html.match(/data-expand="false"/g) ?? []).length, 3);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /No matching tests/);
  assert.match(html, /attribution: exact/);
  assert.match(html, /Show changed-code hits/);
});
