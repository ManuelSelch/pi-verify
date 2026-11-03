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
function row(test: CoverageTest, mode: "covering" | "changed" | "all", report: CoverageReport): string {
  const highlightedDiff = mode === "changed" ? highlightDiff(test.diff, test.file) : [];
  const source = mode === "changed" ? test.diff.map((line, index) => `<span class="diff-${line.kind}">${line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "} ${highlightedDiff[index]}</span>`).join("\n") || "Test diff unavailable." : highlightSource(test.source ?? "Test source unavailable.", test.file);
  const hits = changedHits(test, report);
  return `<details class="coverage-row"><summary>${e(test.name)} <span>${e(test.outcome)}</span></summary><div class="coverage-detail"><p>${e(test.file)}:${test.line ?? "?"} · ${e(test.change)} · attribution: ${e(test.attribution)}</p><pre><code data-syntax="typescript">${source}</code></pre>${hits ? `<details><summary>Show changed-code hits (${test.changedHits.length})</summary>${hits}</details>` : test.attribution !== "exact" ? '<p>Changed-line attribution is unknown.</p>' : ""}</div></details>`;
}
export function coverageHtml(report: CoverageReport): string {
  const covering = report.tests.filter(t => t.changedHits.length > 0 && t.attribution === "exact");
  const changed = report.tests.filter(t => t.change === "added" || t.change === "modified");
  const gaps = report.changedLines.filter(line => line.status === "uncovered");
  const unknown = report.changedLines.filter(line => line.status === "unknown").length;
  const uncertain = report.tests.some(t => t.attribution !== "exact") || unknown > 0;
  const panel = (tests: CoverageTest[], mode: "covering" | "changed" | "all") => tests.length ? tests.map(t => row(t, mode, report)).join("") : `<p>${mode === "covering" && uncertain ? "No reliable test attribution is available; this does not mean no test covers the change." : "No tests match this filter."}</p>`;
  const warning = `${report.run.exitCode !== 0 ? `<p class="coverage-warning">Test run failed with exit code ${report.run.exitCode}.</p>` : ""}${uncertain ? `<p class="coverage-warning">Attribution is incomplete${unknown ? `; ${unknown} changed location(s) have unknown coverage` : ""}.</p>` : ""}`;
  const gapHtml = gaps.length ? `<details class="coverage-gaps"><summary>${gaps.length} uncovered changed line${gaps.length === 1 ? "" : "s"}</summary>${gaps.map(line => `<p>${e(line.file)}:${line.line}</p>${contextBlock(line.context, [line.line], "gap")}`).join("")}</details>` : "";
  const evidence = `<details class="coverage-evidence"><summary>Measurement details</summary><p>${e(report.collector.name)} ${e(report.collector.version)} · ${e(report.run.id)} · ${e(report.run.measuredAt)} · ${e(report.run.command.join(" "))} · exit ${report.run.exitCode}</p><p>Coverage reflects observed execution, not assertion strength. Scope is limited to supplied source and test files; working-tree snapshots were checked against the committed target.</p><ul>${report.limitations.map(item => `<li>${e(item)}</li>`).join("")}</ul><p>${report.setups.length} setup records; ${report.deletedTests.length} removed test definitions.</p></details>`;
  return `<div class="panel"><h2>Tests &amp; coverage</h2>${warning}<div class="coverage-filters"><input type="radio" name="coverage-filter" id="covering" checked><label for="covering">Tests covering changes · ${covering.length}</label><input type="radio" name="coverage-filter" id="changed-tests"><label for="changed-tests">Changed tests · ${changed.length}</label><input type="radio" name="coverage-filter" id="all-tests"><label for="all-tests">All tests · ${report.tests.length}</label><div class="coverage-panels"><div class="covering-panel">${panel(covering, "covering")}</div><div class="changed-panel">${panel(changed, "changed")}</div><div class="all-panel">${panel(report.tests, "all")}</div></div></div>${gapHtml}${evidence}</div>`;
}
export const coverageCss = `.coverage-filters{display:flex;flex-wrap:wrap;gap:4px;margin-top:20px}.coverage-filters input{position:absolute;opacity:0}.coverage-filters label{cursor:pointer;padding:7px 12px;background:#f0f5f2;border-radius:5px;font-size:12px}.coverage-filters input:checked+label{background:#dcefe5;color:#176e5c;font-weight:700}.coverage-filters input:focus-visible+label{outline:3px solid #167b67}.coverage-panels{flex-basis:100%;margin-top:12px}.coverage-panels>div{display:none}.coverage-filters:has(#covering:checked) .covering-panel,.coverage-filters:has(#changed-tests:checked) .changed-panel,.coverage-filters:has(#all-tests:checked) .all-panel{display:block}.coverage-row,.coverage-gaps{border-top:1px solid #e9f0ec}.coverage-row>summary,.coverage-gaps>summary{cursor:pointer;padding:14px 4px}.coverage-row>summary span{float:right;color:#60786b;font-size:12px}.coverage-detail{padding:0 20px 16px}.coverage-detail p,.coverage-evidence{font-size:12px;color:#61786c}.coverage-detail pre:not(.function-context),.coverage-gaps pre:not(.function-context){background:#f7f9f8;border-radius:6px;padding:14px;overflow:auto;white-space:pre}.diff-added{background:#e6f4ec}.diff-removed{background:#fcece9}.coverage-evidence{margin-top:20px}.coverage-evidence summary{cursor:pointer}.coverage-warning{padding:12px;background:#fff4de;color:#825a05;border-radius:6px}.function-context{background:#f7f9f8;border-radius:6px;margin:8px 0;padding:14px 0;overflow:auto;white-space:pre}.function-context>div{display:flex;min-width:max-content;padding-right:16px;border-left:3px solid transparent}.function-context>div>code{font:inherit}.source-line{width:34px;flex-shrink:0;padding-right:8px;text-align:right;color:#8c9991;user-select:none}.source-marker{width:25px;flex-shrink:0;text-align:center;color:#728478;user-select:none}.function-context>.context-hit{background:#edf8f6;border-left-color:#168674}.context-hit .source-marker{color:#168674}.function-context>.context-gap{background:#fff8e7;border-left-color:#bf8b21}.context-gap .source-marker{color:#977336}`;
