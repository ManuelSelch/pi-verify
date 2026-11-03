import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

import { checkSlices, codeSliceModel, diagramSliceModel } from "./guardrail.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "fixture", "src");
const code = () => codeSliceModel({ root });

test("extracts folders and cross-folder imports, skipping tests", () => {
  const model = code();
  assert.deepEqual(model.slices, ["domain", "infra", "report", "ui"]);
  assert.deepEqual(model.edges.map(e => `${e.from}->${e.to}`), ["domain->infra", "report->domain", "ui->report"]);
  assert.deepEqual(model.errors, []);
});

test("a diagram that allows every dependency passes", () => {
  const xml = fs.readFileSync(path.join(here, "fixture", "docs", "architecture.drawio"), "utf8");
  const result = checkSlices(code(), diagramSliceModel(xml));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unused, []);
});

test("an undeclared code dependency fails", () => {
  const xml = drawio(["domain", "infra", "report", "ui"], [["report", "domain"], ["ui", "report"]]);
  const result = checkSlices(code(), diagramSliceModel(xml));
  assert.match(result.errors.join("\n"), /undeclared dependency domain->infra/);
});

test("a missing slice box fails", () => {
  const xml = drawio(["domain", "infra", "report"], [["domain", "infra"], ["report", "domain"], ["ui", "report"]]);
  const result = checkSlices(code(), diagramSliceModel(xml));
  assert.match(result.errors.join("\n"), /missing slice box "ui"/);
});

test("an extra slice box fails", () => {
  const xml = drawio(["domain", "infra", "report", "ui", "legacy"], [["domain", "infra"], ["report", "domain"], ["ui", "report"]]);
  const result = checkSlices(code(), diagramSliceModel(xml));
  assert.match(result.errors.join("\n"), /extra slice box "legacy"/);
});

test("an allowed but unused arrow is reported, not failed", () => {
  const xml = drawio(["domain", "infra", "report", "ui"], [["domain", "infra"], ["report", "domain"], ["ui", "report"], ["ui", "domain"]]);
  const result = checkSlices(code(), diagramSliceModel(xml));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unused, ["ui->domain"]);
});

test("strict mode fails an unused arrow too", () => {
  const xml = drawio(["domain", "infra", "report", "ui"], [["domain", "infra"], ["report", "domain"], ["ui", "report"], ["ui", "domain"]]);
  const result = checkSlices(code(), diagramSliceModel(xml), { strict: true });
  assert.match(result.errors.join("\n"), /unused arrow ui->domain/);
});

test("an arrow between slice boxes without assoc fails", () => {
  const xml = drawio(["domain", "infra", "report", "ui"], [["domain", "infra"], ["report", "domain"], ["ui", "report"]], { declare: false });
  const result = checkSlices(code(), diagramSliceModel(xml));
  assert.match(result.errors.join("\n"), /undeclared arrow ui -> report/);
});

function drawio(slices: string[], edges: [string, string][], options: { declare?: boolean } = {}): string {
  const declare = options.declare ?? true;
  const boxes = slices.map(s => `      <object id="box-${s}" label="${s}" concept="${s}"><mxCell vertex="1" parent="1"><mxGeometry x="0" y="0" width="120" height="50" as="geometry"/></mxCell></object>`);
  const arrows = edges.map(([from, to]) => {
    const assoc = declare ? ` assoc="${from}->${to}"` : "";
    return `      <object id="edge-${from}-${to}"${assoc}><mxCell edge="1" parent="1" source="box-${from}" target="box-${to}"><mxGeometry relative="1" as="geometry"/></mxCell></object>`;
  });
  return `<mxfile><diagram id="d" name="slices"><mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
${[...boxes, ...arrows].join("\n")}
    </root></mxGraphModel></diagram></mxfile>`;
}
