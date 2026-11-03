import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { codeModel, diagramModel, checkModel, diffModel } from "../src/conceptual-model/model.js";
import { conceptualHtml } from "../src/conceptual-model/html.js";

const source = `export type Owner = { pets: Pet[] }; export type Pet = { owner: Owner };`;
const diagram = `<mxfile><diagram><mxGraphModel><root><object id="a" concept="Owner" label="Owner"><mxCell vertex="1"><mxGeometry x="10" y="20" width="100" height="40"/></mxCell></object><object id="b" concept="Pet" label="Pet"><mxCell vertex="1"><mxGeometry x="200" y="20" width="100" height="40"/></mxCell></object><object id="e" assoc="Owner-Pet"><mxCell edge="1" source="a" target="b"/></object><mxCell id="l" parent="e" value="*" vertex="1"><mxGeometry x="0.8" relative="1"/></mxCell></root></mxGraphModel></diagram></mxfile>`;

test("diagram agrees with types and visible association multiplicity", () => {
  assert.deepEqual(checkModel(codeModel(source), diagramModel(diagram)), []);
  assert.match(checkModel(codeModel(source), diagramModel(diagram.replace('value="*"', 'value="1"'))).join(" "), /cardinality/);
});

test("detects missing and spurious claims, including undeclared arrows and mismatched labels", () => {
  const broken = diagram.replace('concept="Pet" label="Pet"', 'concept="Cat" label="Pet"').replace(' assoc="Owner-Pet"', '');
  const errors = checkModel(codeModel(source), diagramModel(broken)).join(" ");
  assert.match(errors, /missing concept Pet/);
  assert.match(errors, /extra concept Cat/);
  assert.match(errors, /label/);
  assert.match(errors, /undeclared/);
});

test("diff compares semantic identities rather than geometry", () => {
  const old = diagramModel(diagram);
  const moved = diagramModel(diagram.replace('x="10"', 'x="55"'));
  assert.deepEqual(diffModel(old, moved), { added: [], removed: [], changed: [] });
  const changed = diagramModel(diagram.replace('value="*"', 'value="?"'));
  assert.deepEqual(diffModel(old, changed).changed, ["association Owner-Pet"]);
});

test("invalid or unsupported diagrams fail loudly", () => {
  assert.throws(() => diagramModel("<mxfile><diagram>"), /Invalid/);
  assert.throws(() => diagramModel('<mxfile><diagram/><diagram/></mxfile>'), /Multiple/);
  assert.throws(() => codeModel('export interface Unhandled {}'), /not supported/);
  assert.match(checkModel(codeModel(source), diagramModel(diagram.replace('x="0.8"', 'x="0"'))).join(" "), /ambiguous/);
});

test("model report escapes diagram labels and explains an absent base", () => {
  const after = diagramModel(diagram.replace('label="Owner"', 'label="&lt;script&gt;"'));
  const html = conceptualHtml({ base: "base", target: "target", basePresent: false, targetPresent: true, before: null, after, delta: diffModel(null, after), guardrail: { status: "failed", diagnostics: ["<script>"] }, diagramXml: diagram });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /No diagram existed at this revision/);
  assert.match(html, /Guardrail failed/);
});

test("unchanged concepts are neutral and additions are highlighted green", () => {
  const after = diagramModel(diagram);
  const before = { ...after, concepts: after.concepts.filter(c => c.name === "Owner"), associations: [] };
  const html = conceptualHtml({ base: "base", target: "target", basePresent: true, targetPresent: true, before, after, delta: diffModel(before, after), guardrail: { status: "unavailable", diagnostics: [] }, diagramXml: diagram });
  assert.match(html, /fill="#ffffff" stroke="#667085"/);
  assert.match(html, /fill="#e0f6e8" stroke="#2e7d32"/);
});

test("repository hand-drawn model stays in sync with TypeScript", async () => {
  const code = await readFile("src/review-report/domain/model.ts", "utf8");
  const drawing = await readFile("docs/conceptual-model.drawio", "utf8");
  assert.deepEqual(checkModel(codeModel(code), diagramModel(drawing)), []);
});
