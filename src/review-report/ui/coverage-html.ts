import type { Context, CoverageReport, CoverageTest } from "../infra/coverage.js";
import { highlightDiff, highlightLines, highlightSource } from "./highlight.js";

const e = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
// The enclosing function is shown with line numbers; only the changed locations are marked.
function contextBlock(context: Context, highlighted: number[], tone: "hit" | "gap"): string {
  const lines = highlightLines(context.source.replace(/[\r\n]+$/, ""), context.file);
  const label = tone === "hit" ? "Executed changed line" : "Uncovered changed line";
  return `<pre class="function-context" aria-label="Enclosing function with highlighted changed lines">${lines.map((html, index) => {
    const line = context.startLine + index;
    const marked = highlighted.includes(line);
    return `<div${marked ? ` class="context-${tone}"` : ""}><span class="source-line" aria-hidden="true">${line}</span><span class="source-marker"${marked ? ` aria-label="${label}"` : ""}>${marked ? "+" : " "}</span><code data-syntax="typescript">${html}</code></div>`;
  }).join("")}</pre>`;
}
function changedHits(test: CoverageTest, report: CoverageReport): string {
  const groups = new Map<string, { context: Context; lines: number[] }>();
  const unlocated: string[] = [];
  for (const hit of test.changedHits) {
    const line = report.changedLines.find(item => item.file === hit.file && item.line === hit.line);
    if (!line) { unlocated.push(`<div><b>${e(hit.file)}:${hit.line}</b></div>`); continue; }
    const key = `${line.context.file}\u0000${line.context.startLine}\u0000${line.context.endLine}`;
    const group = groups.get(key) ?? { context: line.context, lines: [] };
    group.lines.push(hit.line);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ context, lines }) => `<div><b>${e(context.file)}:${lines.join(", ")}</b>${contextBlock(context, lines, "hit")}</div>`).join("") + unlocated.join("");
}
// Uncovered changed lines are shown as the diff that introduced them, not as a whole function.
function uncoveredHtml(report: CoverageReport): string {
  const files = new Map<string, number[]>();
  for (const line of report.changedLines) if (line.status === "uncovered") files.set(line.file, [...files.get(line.file) ?? [], line.line]);
  const total = [...files.values()].reduce((count, lines) => count + lines.length, 0);
  if (!total) return "";
  const body = [...files].map(([file, lines]) => {
    const hunks = report.changedDiffs?.[file]?.filter(hunk => hunk.lines.some(line => line.line !== null && lines.includes(line.line)));
    const diff = hunks?.length ? hunks.map(hunk => `<pre class="coverage-diff">${highlightDiff(hunk.lines, file).map((html, index) => {
      const { kind, line } = hunk.lines[index];
      const marked = line !== null && lines.includes(line);
      return `<div class="diff-${kind}${marked ? " uncovered" : ""}"><span class="source-line" aria-hidden="true">${e(line ?? "")}</span><span class="source-marker"${marked ? ' aria-label="Uncovered changed line"' : ""}>${marked ? "+" : " "}</span><code data-syntax="typescript">${html}</code></div>`;
    }).join("")}</pre>`).join("") : lines.map(line => `<p>${e(file)}:${line}</p>`).join("");
    return `<details class="coverage-gap-file" open><summary>${e(file)} · ${lines.length} uncovered</summary>${diff}</details>`;
  }).join("");
  return `<details class="coverage-gaps" open><summary>Uncovered changed lines · ${total}</summary>${body}</details>`;
}
function row(test: CoverageTest, mode: "covering" | "changed" | "all", report: CoverageReport): string {
  const highlightedDiff = mode === "changed" ? highlightDiff(test.diff, test.file) : [];
  const source = mode === "changed" ? test.diff.map((line, index) => `<span class="diff-${line.kind}">${line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "} ${highlightedDiff[index]}</span>`).join("\n") || "Test diff unavailable." : highlightSource(test.source ?? "Test source unavailable.", test.file);
  const hits = changedHits(test, report);
  return `<details class="coverage-row" data-outcome="${e(test.outcome)}" data-search="${e(`${test.file} ${test.name}`.toLowerCase())}"><summary>${e(test.name)} <span>${e(test.outcome)}</span></summary><div class="coverage-detail"><p>${e(test.file)}:${test.line ?? "?"} · ${e(test.change)} · attribution: ${e(test.attribution)}</p><pre><code data-syntax="typescript">${source}</code></pre>${hits ? `<details><summary>Show changed-code hits (${test.changedHits.length})</summary>${hits}</details>` : test.attribution !== "exact" ? '<p>Changed-line attribution is unknown.</p>' : ""}</div></details>`;
}
function groupedTests(tests: CoverageTest[], mode: "covering" | "changed" | "all", report: CoverageReport): string {
  const folders = new Map<string, Map<string, { label: string; tests: CoverageTest[] }>>();
  for (const test of tests) {
    const parts = test.file.split("/");
    const marker = parts.findIndex(part => part === "__tests__" || part === "tests");
    const boundary = marker > 0 ? marker : marker === 0 ? 1 : parts.length - 1;
    const owner = parts.slice(0, boundary).join("/") || ".";
    const label = parts.slice(marker > 0 ? marker + 1 : boundary).join("/");
    const files = folders.get(owner) ?? new Map();
    const file = files.get(test.file) ?? { label, tests: [] };
    file.tests.push(test);
    files.set(test.file, file);
    folders.set(owner, files);
  }
  const failed = (test: CoverageTest) => ["failed", "error", "timedOut", "timed-out"].includes(test.outcome);
  const summary = (label: string, items: CoverageTest[]) => {
    const outcomes = new Map<string, number>();
    for (const test of items) outcomes.set(test.outcome, (outcomes.get(test.outcome) ?? 0) + 1);
    const counts = [...outcomes].sort(([a], [b]) => a.localeCompare(b)).map(([outcome, count]) => `${count} ${e(outcome)}`).join(" · ");
    return `<summary><span class="coverage-group-label">${e(label)}</span><span class="coverage-group-count${items.some(failed) ? " has-failures" : ""}">${items.length} ${items.length === 1 ? "test" : "tests"} · ${counts}</span></summary>`;
  };
  const body = [...folders].sort(([a], [b]) => a.localeCompare(b)).map(([owner, files]) => {
    const items = [...files.values()].flatMap(file => file.tests);
    const contents = [...files].sort(([, a], [, b]) => a.label.localeCompare(b.label)).map(([path, file]) => `<details class="coverage-file" data-file="${e(path)}"${file.tests.some(failed) ? " open" : ""}>${summary(file.label, file.tests)}<div class="coverage-group-body">${file.tests.map(test => row(test, mode, report)).join("")}</div></details>`).join("");
    return `<details class="coverage-folder" data-folder="${e(owner)}"${items.some(failed) ? " open" : ""}>${summary(owner, items)}<div class="coverage-group-body">${contents}</div></details>`;
  }).join("");
  return `<div class="coverage-tools" hidden><label>Search tests or paths<input type="search" placeholder="Search tests or paths…"></label><div><button type="button" data-expand="true">Expand all</button><button type="button" data-expand="false">Collapse all</button></div></div><p class="coverage-search-count" aria-live="polite" hidden></p>${body}<p class="coverage-search-empty" hidden>No matching tests. Try another name or path.</p>`;
}
export function coverageHtml(report: CoverageReport): string {
  const covering = report.tests.filter(t => t.changedHits.length > 0 && t.attribution === "exact");
  const changed = report.tests.filter(t => t.change === "added" || t.change === "modified");
  const unknown = report.changedLines.filter(line => line.status === "unknown").length;
  const uncertain = report.tests.some(t => t.attribution !== "exact") || unknown > 0;
  const panel = (tests: CoverageTest[], mode: "covering" | "changed" | "all") => tests.length ? groupedTests(tests, mode, report) : `<p>${mode === "covering" && uncertain ? "No reliable test attribution is available; this does not mean no test covers the change." : "No tests match this filter."}</p>`;
  const warning = `${report.run.exitCode !== 0 ? `<p class="coverage-warning">Test run failed with exit code ${report.run.exitCode}.</p>` : ""}${uncertain ? `<p class="coverage-warning">Attribution is incomplete${unknown ? `; ${unknown} changed location(s) have unknown coverage` : ""}.</p>` : ""}`;
  const gapHtml = uncoveredHtml(report);
  const evidence = `<details class="coverage-evidence"><summary>Measurement details</summary><p>${e(report.collector.name)} ${e(report.collector.version)} · ${e(report.run.id)} · ${e(report.run.measuredAt)} · ${e(report.run.command.join(" "))} · exit ${report.run.exitCode}</p><p>Coverage reflects observed execution, not assertion strength. Scope is limited to supplied source and test files; working-tree snapshots were checked against the committed target.</p><ul>${report.limitations.map(item => `<li>${e(item)}</li>`).join("")}</ul><p>${report.setups.length} setup records; ${report.deletedTests.length} removed test definitions.</p></details>`;
  return `<div class="panel"><h2>Tests &amp; coverage</h2>${warning}<div class="coverage-filters"><input type="radio" name="coverage-filter" id="covering" checked><label for="covering">Tests covering changes · ${covering.length}</label><input type="radio" name="coverage-filter" id="changed-tests"><label for="changed-tests">Changed tests · ${changed.length}</label><input type="radio" name="coverage-filter" id="all-tests"><label for="all-tests">All tests · ${report.tests.length}</label><div class="coverage-panels"><div class="covering-panel">${panel(covering, "covering")}</div><div class="changed-panel">${panel(changed, "changed")}</div><div class="all-panel">${panel(report.tests, "all")}</div></div></div>${gapHtml}${evidence}</div>`;
}
export const coverageCss = `[hidden]{display:none!important}.coverage-tools{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:4px 0 18px}.coverage-filters .coverage-tools label{font-size:11px;color:#61786c;background:none;padding:0;cursor:default}.coverage-tools input[type=search]{display:block;position:static;opacity:1;width:300px;max-width:100%;margin-top:4px;border:1px solid #d5e2da;border-radius:6px;padding:9px;font:inherit;font-size:12px}.coverage-tools button{border:0;border-radius:5px;background:#edf7f3;color:#176e5c;padding:8px 10px;cursor:pointer;font:inherit;font-size:12px;margin-left:4px}.coverage-tools input:focus-visible,.coverage-tools button:focus-visible{outline:3px solid #167b67;outline-offset:2px}.coverage-folder{border-top:1px solid #e9f0ec}.coverage-folder>summary,.coverage-file>summary{cursor:pointer;padding:12px 4px;font-size:13px}.coverage-group-label{font-weight:600;overflow-wrap:anywhere}.coverage-file .coverage-group-label{font-weight:400}.coverage-group-count{float:right;color:#60786b;font-size:11px;margin-left:12px}.coverage-group-count.has-failures{color:#a23d3d}.coverage-group-body{margin-left:16px;padding-left:10px;border-left:1px solid #e5eee9}.coverage-search-count,.coverage-search-empty{font-size:12px;color:#61786c;margin-bottom:12px}@media(max-width:760px){.coverage-tools{align-items:stretch;flex-direction:column}.coverage-tools input[type=search]{width:100%}.coverage-group-body{margin-left:6px;padding-left:5px}.coverage-group-count{float:none;display:block;margin-left:16px}}.coverage-filters{display:flex;flex-wrap:wrap;gap:4px;margin-top:20px}.coverage-filters input{position:absolute;opacity:0}.coverage-filters label{cursor:pointer;padding:7px 12px;background:#f0f5f2;border-radius:5px;font-size:12px}.coverage-filters input:checked+label{background:#dcefe5;color:#176e5c;font-weight:700}.coverage-filters input:focus-visible+label{outline:3px solid #167b67}.coverage-panels{flex-basis:100%;margin-top:12px}.coverage-panels>div{display:none}.coverage-filters:has(#covering:checked) .covering-panel,.coverage-filters:has(#changed-tests:checked) .changed-panel,.coverage-filters:has(#all-tests:checked) .all-panel{display:block}.coverage-row,.coverage-gaps{border-top:1px solid #e9f0ec}.coverage-row>summary,.coverage-gaps>summary{cursor:pointer;padding:14px 4px}.coverage-row>summary span{float:right;color:#60786b;font-size:12px}.coverage-detail{padding:0 20px 16px}.coverage-detail p,.coverage-evidence{font-size:12px;color:#61786c}.coverage-detail pre:not(.function-context),.coverage-gaps pre:not(.function-context){background:#f7f9f8;border-radius:6px;padding:14px;overflow:auto;white-space:pre}.diff-added{background:#e6f4ec}.diff-removed{background:#fcece9}.coverage-evidence{margin-top:20px}.coverage-evidence summary{cursor:pointer}.coverage-warning{padding:12px;background:#fff4de;color:#825a05;border-radius:6px}.function-context{background:#f7f9f8;border-radius:6px;margin:8px 0;padding:14px 0;overflow:auto;white-space:pre}.function-context>div{display:flex;min-width:max-content;padding-right:16px;border-left:3px solid transparent}.function-context>div>code{font:inherit}.source-line{width:34px;flex-shrink:0;padding-right:8px;text-align:right;color:#8c9991;user-select:none}.source-marker{width:25px;flex-shrink:0;text-align:center;color:#728478;user-select:none}.function-context>.context-hit{background:#edf8f6;border-left-color:#168674}.context-hit .source-marker{color:#168674}.coverage-gap-file>summary{cursor:pointer;font-weight:600;padding:8px 0}.coverage-diff{background:#f7f9f8;border-radius:6px;margin:8px 0;padding:14px 0;overflow:auto;white-space:pre}.coverage-diff>div{display:flex;min-width:max-content;padding-right:16px;border-left:3px solid transparent}.coverage-diff>div>code{font:inherit}.coverage-diff>.uncovered{background:#fff8e7;border-left-color:#bf8b21}.coverage-diff>.uncovered .source-marker{color:#977336}`;
