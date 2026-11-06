import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { coverageScript } from "../src/review-report/ui/coverage-controls.js";
import { reportHtml } from "../src/review-report/ui/report-html.js";
import type { VerificationReport } from "../src/report.js";
import type { CoverageReport } from "../src/review-report/infra/coverage.js";
import type { ReviewReport, ReviewSection } from "../src/review-report/domain/model.js";

// Minimal DOM boundary double: tests execute the actual embedded script and events.
class Element {
  hidden = true;
  open = false;
  value = "";
  textContent = "";
  dataset: Record<string, string> = {};
  classes = new Set<string>();
  classList = { toggle: (name: string, on: boolean) => on ? this.classes.add(name) : this.classes.delete(name) };
  selectors = new Map<string, Element[]>();
  events = new Map<string, () => void>();
  querySelectorAll(selector: string) { return this.selectors.get(selector) ?? []; }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0]; }
  addEventListener(event: string, handler: () => void) { this.events.set(event, handler); }
  fire(event: string) { this.events.get(event)!(); }
}
function fixture() {
  const panel = new Element(), tools = new Element(), search = new Element(), expand = new Element(), collapse = new Element(), count = new Element(), empty = new Element();
  expand.dataset.expand = "true"; collapse.dataset.expand = "false";
  const rows = [new Element(), new Element()];
  rows[0].dataset = { search: "src/a/__tests__/a.test.ts saves appointment", outcome: "passed" };
  rows[1].dataset = { search: "src/b/__tests__/b.test.ts rejects appointment", outcome: "failed" };
  for (const row of rows) row.hidden = false;
  const groups = [new Element(), new Element(), new Element(), new Element()];
  groups.forEach((group, i) => {
    group.hidden = false;
    group.open = i >= 2;
    group.selectors.set(".coverage-row", [rows[i < 2 ? 0 : 1]]);
    group.selectors.set(":scope>summary>.coverage-group-count", [new Element()]);
  });
  panel.selectors.set(".coverage-tools", [tools]);
  panel.selectors.set('input[type="search"]', [search]);
  panel.selectors.set(".coverage-row", rows);
  panel.selectors.set(".coverage-folder,.coverage-file", groups);
  panel.selectors.set(".coverage-search-count", [count]);
  panel.selectors.set(".coverage-search-empty", [empty]);
  tools.selectors.set("button[data-expand]", [expand, collapse]);
  return { panel, tools, search, expand, collapse, count, empty, rows, groups };
}

test("search matches original paths and names, opens matching ancestors and restores defaults when cleared", () => {
  const f = fixture();
  runInNewContext(coverageScript, { document: { querySelectorAll: () => [f.panel] } });

  assert.equal(f.tools.hidden, false);
  f.search.value = " SAVES "; f.search.fire("input");

  assert.equal(f.rows[0].hidden, false);
  assert.equal(f.rows[1].hidden, true);
  assert.equal(f.groups[0].open, true);
  assert.equal(f.groups[2].hidden, true);
  assert.equal(f.count.textContent, "1 of 2 tests");
  assert.equal(f.groups[0].querySelector(":scope>summary>.coverage-group-count").textContent, "1 test · 1 passed");

  f.search.value = "__tests__/b.test.ts"; f.search.fire("input");
  assert.equal(f.rows[1].hidden, false);
  assert.equal(f.groups[2].querySelector(":scope>summary>.coverage-group-count").classes.has("has-failures"), true);

  f.search.value = "not found"; f.search.fire("input");
  assert.equal(f.empty.hidden, false);
  assert.equal(f.count.textContent, "0 of 2 tests");

  f.search.value = ""; f.search.fire("input");
  assert.equal(f.empty.hidden, true);
  assert.deepEqual(f.groups.map(g => g.open), [false, false, true, true]);
});

test("bulk actions affect only folder/file groups in their own view", () => {
  const a = fixture(), b = fixture();
  runInNewContext(coverageScript, { document: { querySelectorAll: () => [a.panel, b.panel] } });

  a.expand.fire("click");
  assert.ok(a.groups.every(g => g.open));
  assert.equal(b.groups[0].open, false);
  assert.equal(a.rows[0].open, false, "test evidence stays individually expandable");

  a.collapse.fire("click");
  assert.ok(a.groups.every(g => !g.open));
  assert.equal(b.groups[2].open, true);
});

test("coverage controls are self-contained and authorized by an exact CSP hash only when coverage exists", () => {
  const coverage: CoverageReport = { schemaVersion: 1, collector: { name: "Supercov", version: "1" }, run: { id: "1", exitCode: 0, command: [], measuredAt: "now" }, comparison: { base: "a", head: "b", projectPath: "", workingTree: true }, sources: {}, stale: false, tests: [], setups: [], deletedTests: [], changedLines: [], limitations: [] };
  const section: ReviewSection = { status: "unavailable", source: "not-collected", scope: "test", revision: null, limitations: [], evidence: [] };
  const sections: ReviewReport["sections"] = { overview: section, changes: section, testsCoverage: section, complexity: section, architecture: section, evidence: section };
  const report: VerificationReport = { goal: "<script>untrusted()</script>", verdict: "unknown", review: { schemaVersion: 1, sections, comparison: { status: "available", base: "a", target: "b", targetTree: "b", method: "explicit", includesUncommitted: false, excludedWorkingTree: { staged: [], unstaged: [], untracked: [] }, limitations: [] }, coverage } };
  const html = reportHtml(report, ".");

  assert.ok(html.includes(`<script>${coverageScript}</script>`));
  assert.ok(html.includes(`script-src 'sha256-${createHash("sha256").update(coverageScript).digest("base64")}'`));
  assert.doesNotMatch(html, /script-src 'unsafe-inline'|<script>untrusted/);
  assert.match(html, /&lt;script&gt;untrusted/);
  assert.doesNotMatch(reportHtml({ goal: "none", verdict: "unknown" }, "."), /<script|script-src/);
});
