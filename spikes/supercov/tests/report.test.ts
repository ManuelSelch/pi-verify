import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import vm from "node:vm";
import { filterScript, renderEvidence, renderReport } from "../src/report.ts";
import type { Report } from "../src/model.ts";

let report: Report;
beforeEach(() => {
  report = {
    schemaVersion: 1, collector: { name: "Supercov", version: "4.22.0" },
    run: { id: "run_example", exitCode: 0, command: ["npm", "test"], measuredAt: "2026-01-01T00:00:00Z" },
    comparison: { base: "a".repeat(40), head: "b".repeat(40), projectPath: "", workingTree: true },
    stale: false, sources: {}, tests: [], setups: [], changedLines: [], deletedTests: [], limitations: [],
  };
});

test("escapes test names, source, diffs, locations and limitations in portable HTML", () => {
  const malicious = '</script><img src=x onerror="alert(1)">';
  report.tests.push({ id: "one", name: malicious, file: malicious, line: 1, source: malicious, change: "added", diff: [{ kind: "added", text: malicious }], outcome: "unknown", attribution: "unavailable", executedLines: [], changedHits: [] });
  report.limitations.push(malicious);

  const html = renderReport(report);

  assert.ok(!html.includes(malicious));
  assert.ok(html.includes("&lt;/script&gt;&lt;img"));
  assert.ok(html.includes('default-src \'none\''));
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
  assert.ok(!html.includes('class="passed">Unknown'));
});

test("evidence page escapes limits and highlights removed source without executable markup", () => {
  const malicious = '</script><img src=x onerror="alert(1)">';
  report.limitations.push(malicious);
  report.deletedTests.push({ file: malicious, name: malicious, source: `const value = '${malicious}';` });

  const html = renderEvidence(report);

  assert.ok(!html.includes(malicious));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script"));
  assert.match(html, /data-syntax="typescript"/);
  assert.match(html, /href="index.html"/);
});

test("defaults to Tests covering changes before Changed tests and All tests", () => {
  report.tests.push({ id: "one", name: "unrelated", file: "tests/a.ts", line: 1, source: "test('unrelated', () => {});", change: "added", diff: [], outcome: "passed", attribution: "exact", executedLines: [], changedHits: [] });

  const html = renderReport(report);

  const filters = [...html.matchAll(/<button data-filter-button="([^"]+)" aria-pressed="([^"]+)">([^<]+)<\/button>/g)];
  assert.deepEqual(filters.map(match => [match[1], match[2]]), [["covering", "true"], ["changed", "false"], ["all", "false"]]);
  assert.ok(filters[0][3].startsWith("Tests covering changes"));
  assert.match(html, /class="test-list" data-filter="covering"/);
  assert.match(html, /data-covering="false" hidden/);
  assert.match(html, /class="empty">No tests match this filter/);
});

test("filter interactions select exact subsets, switch source/diff mode and collapse details", () => {
  type Row = { dataset: { change: string; covering: string }; open: boolean; hidden: boolean; querySelectorAll: () => { open: boolean }[] };
  const nested = [{ open: true }];
  const rows: Row[] = [
    { dataset: { change: "unchanged", covering: "true" }, open: true, hidden: false, querySelectorAll: () => nested },
    { dataset: { change: "modified", covering: "false" }, open: false, hidden: true, querySelectorAll: () => [] },
    { dataset: { change: "added", covering: "false" }, open: false, hidden: true, querySelectorAll: () => [] },
  ];
  const actions = new Map<string, () => void>();
  const buttons = ["covering", "changed", "all"].map(mode => ({
    dataset: { filterButton: mode }, pressed: mode === "covering",
    addEventListener(_event: string, callback: () => void) { actions.set(mode, callback); },
    setAttribute(_name: string, value: string) { this.pressed = value === "true"; },
  }));
  const list = { dataset: { filter: "covering" }, querySelectorAll: () => rows };
  const empty = { hidden: true };
  const document = { querySelector: (selector: string) => selector === ".test-list" ? list : empty, querySelectorAll: () => buttons };

  vm.runInNewContext(filterScript, { document });
  actions.get("changed")!();

  assert.equal(list.dataset.filter, "changed");
  assert.deepEqual(rows.map(row => row.hidden), [true, false, false]);
  assert.ok(rows.every(row => !row.open));
  assert.equal(nested[0].open, false);
  assert.deepEqual(buttons.map(button => button.pressed), [false, true, false]);

  actions.get("covering")!();

  assert.deepEqual(rows.map(row => row.hidden), [false, true, true]);
  assert.equal(list.dataset.filter, "covering");

  actions.get("all")!();

  assert.ok(rows.every(row => !row.hidden));
  assert.equal(empty.hidden, true);
});
