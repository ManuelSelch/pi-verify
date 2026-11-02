import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Context } from "./analysis.ts";
import type { Report, TestEvidence } from "./model.ts";
import { escapeHtml as e } from "./html.ts";
import { highlightDiff, highlightLines, highlightSource } from "./highlight.ts";
const caret = '<span class="caret" aria-hidden="true">▸</span>';
const css = `
:root{color:#263431;background:#fff;font-synthesis:none}*{box-sizing:border-box}body{margin:0;font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:940px;margin:auto;padding:30px 28px}.title{display:flex;align-items:center;gap:9px;flex-wrap:wrap}h1{font-size:20px;letter-spacing:-.4px;margin:0;font-weight:650}.badge{margin-left:auto;font-size:10px;color:#60746a;background:#f1f5f3;padding:1px 7px;border-radius:4px}header .context{font-size:12px;color:#788780;margin:7px 0 22px}.filters{display:inline-flex;max-width:100%;padding:3px;gap:3px;background:#f2f5f3;border-radius:5px;margin-bottom:16px}.filters button{border:0;background:transparent;color:#677c70;border-radius:3px;font:inherit;font-size:12px;padding:6px 10px;cursor:pointer}.filters button[aria-pressed=true]{background:white;color:#263431;box-shadow:0 1px 3px #22332218}.test-list{border-top:1px solid #e4eae6}.test-row{border-bottom:1px solid #e4eae6}.test-row>summary,.uncovered>summary{list-style:none;display:flex;align-items:center;gap:9px;cursor:pointer}.test-row>summary::-webkit-details-marker,.uncovered>summary::-webkit-details-marker{display:none}.test-row>summary{padding:13px 4px;font-weight:500;line-height:1.5}.test-row>summary:hover{color:#147962;background:#fafcfb}.caret{color:#8a9991;flex-shrink:0;display:inline-block}.test-row[open]>summary .caret,.uncovered[open]>summary .caret{transform:rotate(90deg)}.qualifier{font-size:11px;color:#7b897f;margin-left:auto}.test-detail{padding:0 17px 18px 27px}.detail-meta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:11px;color:#829087;margin-bottom:12px}.detail-meta code{margin-right:auto;color:#75877c}.passed{color:#357963}.failed{color:#b64040}.test-source,.test-diff{background:#f7f9f8;border:1px solid #e8ede9;border-radius:5px;margin:0;font:12px/1.9 ui-monospace,SFMono-Regular,Menlo,monospace;overflow:auto}.test-source{padding:12px 15px}.test-diff{padding:8px 0}.test-diff>div{display:flex;min-width:max-content;padding-right:15px}.diff-marker{width:30px;text-align:center;user-select:none;color:#718178;flex-shrink:0}.added{background:#e6f4ec}.removed{background:#fcece9}.added .diff-marker{color:#287849}.removed .diff-marker{color:#b34a43}.coverage-summary{font-size:12px;color:#3b7462;margin:14px 0 8px}.note{font-size:11px;color:#7c8a81;margin:12px 0 0;line-height:1.7}.hits-disclosure>summary{font-size:11px;color:#74847b;cursor:pointer}.hit-location{margin-top:13px;font-size:11px;color:#5c7465}.function-context{background:#f7f9f8;border:1px solid #e8ede9;border-radius:5px;padding:9px 0;margin:10px 0;font:12px/1.9 ui-monospace,SFMono-Regular,Menlo,monospace;overflow:auto}.function-context>div{display:flex;min-width:max-content;padding-right:16px;border-left:3px solid transparent}.source-line{width:34px;flex-shrink:0;text-align:right;color:#8c9991;user-select:none}.source-marker{width:25px;flex-shrink:0;text-align:center;color:#728478;user-select:none}.function-context>.context-hit{background:#edf8f6;border-left-color:#168674}.context-hit .source-marker{color:#168674}.function-context>.context-gap{background:#fff8e7;border-left-color:#bf8b21}.context-gap .source-marker{color:#977336}.uncovered{margin-top:22px;color:#977336}.uncovered>summary{font-size:11px;padding:5px 4px}.uncovered-detail{margin:10px 0 0 27px;font-size:11px;color:#7b6c51}a{color:#346e59}.evidence-link{font-size:11px;margin-left:8px;white-space:nowrap}.evidence-page h2{font-size:15px;margin-top:24px}.evidence-page p,.evidence-page li{font-size:12px;overflow-wrap:anywhere}.run-notice{padding:12px 15px;margin-bottom:18px;background:#fff5df;border:1px solid #eedfc0;border-radius:5px;font-size:12px}.run-notice.error{background:#fceeea;border-color:#ebd3cb}.empty{font-size:12px;color:#7b8278;padding:16px}.test-list[data-filter=changed] .current-source,.test-list:not([data-filter=changed]) .diff-source{display:none}[hidden]{display:none!important}summary:focus-visible,button:focus-visible{outline:2px solid #438976;outline-offset:3px;border-radius:3px}.setup-list{padding-left:20px}@media(max-width:580px){main{padding:22px 16px}header .context{line-height:1.8;overflow-wrap:anywhere}.filters button{font-size:10px;padding:7px}.test-detail{padding-left:19px;padding-right:0}.test-row>summary{font-size:12px}.detail-meta{gap:8px}}
`;
export const filterScript = `
const list = document.querySelector('.test-list');
const buttons = document.querySelectorAll('[data-filter-button]');
for (const button of buttons) {
  button.addEventListener('click', () => {
    const mode = button.dataset.filterButton;
    list.dataset.filter = mode;
    for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
    let count = 0;
    for (const row of list.querySelectorAll('details.test-row')) {
      row.open = false;
      for (const nested of row.querySelectorAll('details')) nested.open = false;
      row.hidden = mode === 'changed' ? !['added', 'modified'].includes(row.dataset.change) : mode === 'covering' ? row.dataset.covering !== 'true' : false;
      if (!row.hidden) count++;
    }
    document.querySelector('.empty').hidden = count > 0;
  });
}
`;

function contextHtml(context: Context, highlighted: number[], tone: "hit" | "gap"): string {
  const lines = highlightLines(context.source);
  return `<div class="hit-location"><code>${e(context.file)}:${context.startLine}–${context.endLine}</code></div><pre class="function-context">${lines.map((lineHtml, index) => {
    const line = context.startLine + index;
    const marked = highlighted.includes(line);
    return `<div data-line="${line}" class="${marked ? `context-${tone}` : ""}"><span class="source-line" aria-hidden="true">${line}</span><span class="source-marker"${marked ? ` aria-label="${tone === "hit" ? "Executed" : "Uncovered"} changed line"` : ' aria-hidden="true"'}>${marked ? "+" : " "}</span><code data-syntax="typescript">${lineHtml}</code></div>`;
  }).join("")}</pre>`;
}
function contextsFor(report: Report, hits: { file: string; line: number }[]): { context: Context; lines: number[] }[] {
  const result = new Map<string, { context: Context; lines: number[] }>();
  for (const hit of hits) {
    const changed = report.changedLines.find(item => item.file === hit.file && item.line === hit.line);
    if (!changed) continue;
    const key = `${hit.file}:${changed.context.startLine}:${changed.context.endLine}`;
    const group = result.get(key) ?? { context: changed.context, lines: [] };
    group.lines.push(hit.line);
    result.set(key, group);
  }
  return [...result.values()];
}
function rowHtml(report: Report, item: TestEvidence, duplicate: boolean): string {
  const hitCount = item.changedHits.length;
  const files = new Set(item.changedHits.map(hit => hit.file)).size;
  const changedHits = hitCount ? `<p class="coverage-summary">Executed ${hitCount} changed line${hitCount === 1 ? "" : "s"} in ${files} file${files === 1 ? "" : "s"}.</p><details class="hits-disclosure"><summary>Show changed-code hits</summary>${contextsFor(report, item.changedHits).map(group => contextHtml(group.context, group.lines, "hit")).join("")}</details>`
    : `<p class="note">${item.attribution !== "exact" ? "Changed-line attribution is unknown for this test." : "No changed executable lines were observed in this test’s execution."}</p>`;
  const highlightedDiff = highlightDiff(item.diff);
  const diff = item.diff.map((line, index) => `<div class="${line.kind}"><span class="diff-marker" aria-hidden="true">${line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</span><code data-syntax="typescript">${highlightedDiff[index]}</code></div>`).join("");
  return `<details class="test-row" data-change="${item.change}" data-covering="${hitCount > 0}"${hitCount ? "" : " hidden"}><summary>${caret}<span>${e(item.name)}</span>${duplicate ? `<span class="qualifier">${e(item.file)}:${item.line ?? "?"}</span>` : ""}</summary><div class="test-detail"><div class="detail-meta"><code>${e(item.file)}:${item.line ?? "?"}</code><span>${e(item.change)}</span><span class="${item.outcome === "failed" ? "failed" : item.outcome === "passed" ? "passed" : "unknown"}">${e(item.outcome.charAt(0).toUpperCase() + item.outcome.slice(1))}</span></div><div class="current-source"><pre class="test-source"><code data-syntax="typescript">${item.source === null ? e("Test source unavailable for this measured identity.") : highlightSource(item.source)}</code></pre></div><div class="diff-source"><pre class="test-diff">${diff || "Test diff unavailable."}</pre></div>${changedHits}</div></details>`;
}

export function renderReport(report: Report): string {
  const changed = report.tests.filter(item => ["added", "modified"].includes(item.change)).length;
  const covering = report.tests.filter(item => item.changedHits.length).length;
  const uncertain = report.stale || report.tests.some(item => item.attribution !== "exact") || report.changedLines.some(item => item.status === "unknown");
  const gaps = report.changedLines.filter(item => item.status === "uncovered");
  const unknown = report.changedLines.filter(item => item.status === "unknown");
  const notices = `${report.stale ? '<div class="run-notice"><b>Stale measurement</b><br>Source or tests changed after collection. Current changed-line attribution is withheld. Embedded code is the measured snapshot.</div>' : ""}${report.run.exitCode !== 0 ? `<div class="run-notice error"><b>Test run failed</b><br>Exit code ${report.run.exitCode}. Retained execution evidence does not make this a successful verification.</div>` : ""}${!report.stale && uncertain ? '<div class="run-notice"><b>Attribution incomplete</b><br>Some coverage is unknown, not zero. Only exact per-test changed-code hits appear in Tests covering changes.</div>' : ""}`;
  const gapHtml = gaps.length ? `<details class="uncovered"><summary>${caret}<span>${gaps.length} changed executable line${gaps.length === 1 ? "" : "s"} not covered by any measured test</span></summary><div class="uncovered-detail">${contextsFor(report, gaps).map(group => contextHtml(group.context, group.lines, "gap")).join("")}</div></details>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'"><title>TypeScript per-test coverage spike</title><style>${css}</style></head><body><main><header><div class="title"><h1>Tests</h1><span class="badge">Measured spike · Supercov ${e(report.collector.version)}</span><a class="evidence-link" href="evidence.html">Run evidence</a></div><p class="context">${e(report.comparison.base.slice(0, 8))} → ${e(report.comparison.head.slice(0, 8))} + working tree · TypeScript / node:test · ${e(report.run.id)}</p></header>${notices}<div class="filters" role="group" aria-label="Filter tests"><button data-filter-button="covering" aria-pressed="true">Tests covering changes · ${report.stale ? "unknown" : covering}</button><button data-filter-button="changed" aria-pressed="false">Changed tests · ${changed}</button><button data-filter-button="all" aria-pressed="false">All tests · ${report.tests.length}</button></div><section class="test-list" data-filter="covering" aria-label="Tests">${report.tests.map(item => rowHtml(report, item, report.tests.filter(other => other.name === item.name).length > 1)).join("")}<p class="empty"${covering ? " hidden" : ""}>${uncertain ? "No reliable attribution is available for this selection. This does not mean no tests cover the change." : "No tests match this filter."}</p></section>${gapHtml}${unknown.length ? `<p class="note">${unknown.length} changed location(s) have unknown coverage.</p>` : ""}</main><script>${filterScript}</script></body></html>`;
}

export function renderEvidence(report: Report): string {
  const setups = report.setups.length ? `<h2>Setup evidence (separate from tests)</h2><ul>${report.setups.map(item => `<li>${e(item.name)} · ${e(item.outcome)} · ${item.executedLines.length} observed source locations</li>`).join("")}</ul>` : "";
  const removed = report.deletedTests.length ? `<h2>Removed tests (base source)</h2>${report.deletedTests.map(item => `<p>${e(item.file)} / ${e(item.name)}</p><pre class="test-source"><code data-syntax="typescript">${highlightSource(item.source)}</code></pre>`).join("")}` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"><title>Run evidence</title><style>${css}</style></head><body><main class="evidence-page"><a href="index.html">← Tests</a><h1>Run evidence</h1><p>${e(report.run.id)} · ${e(report.run.measuredAt)} · command: ${e(report.run.command.join(" "))} · exit ${report.run.exitCode}${report.stale ? " · STALE" : ""}</p><p>Measured execution does not prove assertion strength. Embedded sources are measurement-time snapshots.</p><p>${report.setups.length} setup records; ${report.deletedTests.length} removed test definitions; ${report.changedLines.filter(item => item.status === "not-executable").length} non-executable changed locations excluded.</p><h2>Downloads</h2><ul><li><a href="report.json">Collector-neutral JSON</a></li><li><a href="supercov-evidence.json">Raw adapter evidence</a></li><li><a href="measurement.stdout.log">Test output</a></li><li><a href="measurement.stderr.log">Collector log</a></li></ul><h2>Measurement limits</h2><ul>${report.limitations.map(item => `<li>${e(item)}</li>`).join("")}</ul>${setups}${removed}</main></body></html>`;
}

export async function writeReport(report: Report, outputDirectory: string): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(outputDirectory, "index.html"), renderReport(report));
  await writeFile(path.join(outputDirectory, "evidence.html"), renderEvidence(report));
}
