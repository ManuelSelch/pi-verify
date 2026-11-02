import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeReport } from "../src/report.ts";
import type { Report, TestEvidence } from "../src/model.ts";
import { diffLines } from "../src/analysis.ts";

const source = 'test("a < b & c", () => {\n  // Keep whitespace and literal content.\n  const text: string = `first\nsecond`;\n  assert.equal(price(200, false), 200);\n});';
const oldSource = source.replace("price(200, false), 200", "price(100, false), 100");
const functionSource = 'export function price(total: number): number {\n  if (total < 0) return 0;\n  return total;\n}';
const decode = (value: string) => value.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[entity]!);
function textOf(html: string): string { return decode(html.replace(/<[^>]*>/g, "")); }
function tokenColors(html: string): Set<string> { return new Set([...html.matchAll(/style="color:(#[0-9a-f]+)/gi)].map(match => match[1])); }

export class HighlightingDriver {
  directory = "";
  html = "";
  model: Report = {
    schemaVersion: 1, collector: { name: "Supercov", version: "4.22.0" },
    run: { id: "run_highlighting", exitCode: 0, command: ["npm", "test"], measuredAt: "2026-01-01T00:00:00Z" },
    comparison: { base: "a".repeat(40), head: "b".repeat(40), workingTree: true },
    stale: false, sources: {}, tests: [], setups: [], changedLines: [], deletedTests: [], limitations: ["Fixture measurement limitation"],
  };
  async dispose(): Promise<void> {
    if (this.directory) await rm(this.directory, { recursive: true, force: true });
  }
  async prepareTypeScriptSourceAndEditedTest(): Promise<void> {
    const item: TestEvidence = {
      id: "example", name: "a < b & c", file: "tests/pricing.test.ts", line: 1, source,
      change: "modified", diff: diffLines(oldSource, source), outcome: "passed", attribution: "exact", executedLines: [], changedHits: [],
    };
    this.model.tests.push(item);
  }
  async generatePortableReport(): Promise<void> {
    this.directory = await mkdtemp(path.join(tmpdir(), "pi-verify-shiki-"));
    await writeReport(this.model, this.directory);
    this.html = await readFile(path.join(this.directory, "index.html"), "utf8");
  }
  codeBlock(className: string): string {
    const match = new RegExp(`<pre class="${className}">([\\s\\S]*?)</pre>`).exec(this.html);
    assert.ok(match, `Missing ${className} code block`);
    return match[1];
  }
  async expectSyntaxColorsInSourceAndDiff(): Promise<void> {
    assert.ok(tokenColors(this.codeBlock("test-source")).size >= 3, "TypeScript source should have distinct token colors");
    const diff = this.codeBlock("test-diff");
    for (const kind of ["removed", "added"]) {
      const line = new RegExp(`<div class="${kind}">([\\s\\S]*?)</div>`).exec(diff);
      assert.ok(line, `${kind} diff line must be present`);
      assert.ok(tokenColors(line[1]).size >= 2, `${kind} diff side must retain syntax colors`);
    }
  }
  async expectCopiedSourceAndDiffTextPreserved(): Promise<void> {
    assert.equal(textOf(this.codeBlock("test-source")), source);
    const rows = [...this.codeBlock("test-diff").matchAll(/<div class="(context|added|removed)">([\s\S]*?)<\/div>/g)];
    const before = rows.filter(row => row[1] !== "added").map(row => textOf(row[2].replace(/<span class="diff-marker"[^>]*>[\s\S]*?<\/span>/, ""))).join("\n");
    const after = rows.filter(row => row[1] !== "removed").map(row => textOf(row[2].replace(/<span class="diff-marker"[^>]*>[\s\S]*?<\/span>/, ""))).join("\n");
    assert.equal(before, oldSource);
    assert.equal(after, source);
  }
  async prepareCoveredAndUncoveredChangedLines(): Promise<void> {
    await this.prepareTypeScriptSourceAndEditedTest();
    const file = "src/pricing.ts";
    const context = { file, startLine: 1, endLine: 4, source: functionSource };
    this.model.tests[0].changedHits = [{ file, line: 2 }];
    this.model.changedLines = [
      { file, line: 2, status: "covered", coveringTests: ["example"], context },
      { file, line: 3, status: "uncovered", coveringTests: [], context },
    ];
  }
  async expectWholeFunctionContextWithSyntaxColors(): Promise<void> {
    const context = this.codeBlock("function-context");
    const rows = [...context.matchAll(/<div data-line="\d+"[^>]*>([\s\S]*?)<\/div>/g)];
    const code = rows.map(row => {
      const match = /<code[^>]*>([\s\S]*?)<\/code>/.exec(row[1]);
      assert.ok(match);
      return textOf(match[1]);
    }).join("\n");
    assert.equal(code, functionSource);
    assert.ok(tokenColors(context).size >= 3);
  }
  async expectTealExecutedGutterAndAmberGapGutter(): Promise<void> {
    assert.match(this.html, /data-line="2" class="context-hit"/);
    assert.match(this.html, /data-line="3" class="context-gap"/);
    assert.match(this.html, /\.function-context>\.context-hit\{[^}]*border-left-color:#168674/);
    assert.match(this.html, /\.function-context>\.context-gap\{[^}]*border-left-color:#bf8b21/);
    assert.ok(this.html.includes('class="added"') && this.html.includes('class="removed"'), "Git diff markings remain separate");
  }
  async expectContextLinesHaveNoCoverageHighlight(): Promise<void> {
    for (const line of [1, 4]) {
      assert.match(this.html, new RegExp(`data-line="${line}" class=""`));
      assert.ok(!this.html.includes(`data-line="${line}" class="context-hit"`));
      assert.ok(!this.html.includes(`data-line="${line}" class="context-gap"`));
    }
  }
  async prepareSourceContainingHtmlAndScriptText(): Promise<void> {
    await this.prepareTypeScriptSourceAndEditedTest();
    const unsafe = 'const value: string = "</script><img src=x onerror=alert(1)>";';
    this.model.tests[0].source = unsafe;
    this.model.tests[0].diff = diffLines("", unsafe);
  }
  async expectSourceEscapedWithoutExecutableMarkup(): Promise<void> {
    assert.equal(textOf(this.codeBlock("test-source")), this.model.tests[0].source);
    assert.ok(!this.html.includes("<img"));
    assert.equal((this.html.match(/<script>/g) ?? []).length, 1);
    assert.equal((this.html.match(/<\/script>/g) ?? []).length, 1);
    assert.match(this.html, /&lt;/);
  }
  async expectNoHighlightingScriptsOrExternalAssetsRequired(): Promise<void> {
    const script = /<script>([\s\S]*?)<\/script>/.exec(this.html);
    assert.ok(script);
    assert.ok(!/shiki|fetch\(|import\(|WebAssembly/.test(script[1]));
    assert.ok(!/<(?:script|link|img)\b[^>]*(?:src|href)=/i.test(this.html));
    const json = JSON.parse(await readFile(path.join(this.directory, "report.json"), "utf8"));
    assert.equal(json.tests[0].source, this.model.tests[0].source, "JSON source is unchanged by highlighting");
  }
  async expectCompactReportAndAccessibleEvidence(): Promise<void> {
    assert.ok(!this.html.includes("Measurement context &amp; limits"));
    assert.ok(!this.html.includes("Measured execution does not prove"));
    assert.ok(!this.html.includes("Green +:"));
    assert.ok(!this.html.includes("Amber +:"));
    assert.match(this.html, /href="evidence.html"/);
    const evidence = await readFile(path.join(this.directory, "evidence.html"), "utf8");
    assert.match(evidence, /Fixture measurement limitation/);
    for (const file of ["report.json", "supercov-evidence.json", "measurement.stdout.log", "measurement.stderr.log"])
      assert.ok(evidence.includes(`href="${file}"`), `Missing preserved evidence link ${file}`);
    assert.match(evidence, /href="index.html"/);
  }
}
