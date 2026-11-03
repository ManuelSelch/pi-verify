import test from "node:test";
import assert from "node:assert/strict";
import { checkSlices, codeSliceModel, diagramSliceModel, diffSliceModel, unusedAssociations } from "../src/slice-model/model.js";
import { sliceHtml } from "../src/slice-model/html.js";

const files = (entries: Record<string, string>) => new Map(Object.entries(entries));

const source = files({
  "domain/model.ts": `import { table } from "../infra/db"; export type Owner = { id: string }; export const owners = table("owners");`,
  "infra/db.ts": `export function table(name: string) { return name; }`,
  "report/report.ts": `import type { Owner } from "../domain/model"; export function report(owner: Owner) { return owner.id; }`,
  "ui/page.ts": `import { report } from "../report/report"; export const page = report;`,
  "domain/owner.test.ts": `import { page } from "../ui/page"; export const leaked = page;`,
  "index.ts": `import { page } from "./ui/page"; export const entry = page;`,
});

function drawing(slices: string[], edges: string[], options: { declare?: boolean; label?: (slice: string) => string } = {}): string {
  const boxes = slices.map(slice => `<object id="box-${slice}" concept="${slice}" label="${options.label?.(slice) ?? slice}"><mxCell vertex="1"><mxGeometry x="0" y="0" width="140" height="50"/></mxCell></object>`).join("");
  const arrows = edges.map(edge => {
    const [from, to] = edge.split("->");
    const assoc = options.declare === false ? "" : ` assoc="${from}->${to}"`;
    return `<object id="edge-${from}-${to}"${assoc}><mxCell edge="1" source="box-${from}" target="box-${to}"/></object>`;
  }).join("");
  return `<mxfile><diagram><mxGraphModel><root>${boxes}${arrows}</root></mxGraphModel></diagram></mxfile>`;
}

const allowed = ["domain", "infra", "report", "ui"];
const dependencies = ["domain->infra", "report->domain", "ui->report"];

test("extracts top-level folders and cross-folder imports, skipping tests and root files", () => {
  const model = codeSliceModel({ files: source });
  assert.deepEqual(model.concepts.map(concept => concept.name), ["domain", "infra", "report", "ui"]);
  assert.deepEqual(model.edges.map(edge => edge.key), dependencies);
});

test("resolves emitted .js specifiers back to their TypeScript source", () => {
  const model = codeSliceModel({ files: files({ "a/one.ts": `import { two } from "../b/two.js"; export const one = two;`, "b/two.ts": `export const two = 2;` }) });
  assert.deepEqual(model.edges.map(edge => edge.key), ["a->b"]);
});

test("a matching diagram passes and geometry is ignored", () => {
  const code = codeSliceModel({ files: source });
  const after = diagramSliceModel(drawing(allowed, dependencies));
  assert.deepEqual(checkSlices(code, after), []);
  const moved = diagramSliceModel(drawing(allowed, dependencies).replaceAll('x="0"', 'x="300"'));
  assert.deepEqual(diffSliceModel(after, moved), { added: [], removed: [], changed: [] });
});

test("reports missing slices, extra slices and undeclared dependencies", () => {
  const code = codeSliceModel({ files: source });
  const missing = checkSlices(code, diagramSliceModel(drawing(["domain", "infra", "report"], ["report->domain", "ui->report"]))).join(" ");
  assert.match(missing, /missing slice ui/);
  assert.match(missing, /undeclared association domain->infra/);
  const extra = checkSlices(code, diagramSliceModel(drawing([...allowed, "legacy"], dependencies))).join(" ");
  assert.match(extra, /extra slice legacy/);
});

test("an allowed but unused arrow is reported, not failed, unless strict", () => {
  const code = codeSliceModel({ files: source });
  const diagram = diagramSliceModel(drawing(allowed, [...dependencies, "ui->domain"]));
  assert.deepEqual(checkSlices(code, diagram), []);
  assert.deepEqual(unusedAssociations(code, diagram), ["ui->domain"]);
  assert.match(checkSlices(code, diagram, { strict: true }).join(" "), /unused association ui->domain/);
});

test("rejects undeclared lines, wrong identites and mismatched labels", () => {
  const code = codeSliceModel({ files: source });
  assert.match(checkSlices(code, diagramSliceModel(drawing(allowed, dependencies, { declare: false }))).join(" "), /undeclared association/);
  assert.match(checkSlices(code, diagramSliceModel(drawing(allowed, dependencies, { label: slice => slice === "domain" ? "Domain layer" : slice }))).join(" "), /label does not match/);
  assert.throws(() => diagramSliceModel("<mxfile><diagram>"), /Invalid/);
  assert.throws(() => diagramSliceModel("<mxfile><diagram/><diagram/></mxfile>"), /Multiple/);
  assert.match(checkSlices(code, diagramSliceModel(`<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`)).join(" "), /no slices/);
});

test("diff highlights added, removed and changed slices and arrows", () => {
  const before = diagramSliceModel(drawing(["domain"], []));
  const after = diagramSliceModel(drawing(["domain", "infra"], [], { label: slice => slice === "domain" ? "Core" : slice }));
  assert.deepEqual(diffSliceModel(before, after), { added: ["slice infra"], removed: [], changed: ["slice domain"] });
  assert.deepEqual(diffSliceModel(after, before), { added: [], removed: ["slice infra"], changed: ["slice domain"] });
  assert.deepEqual(diffSliceModel(null, before).added, ["slice domain"]);
});

test("slice report escapes diagram labels and states its guardrail", () => {
  const after = diagramSliceModel(drawing(["<script>"], []));
  const failed = sliceHtml({ base: "b", target: "t", basePresent: true, targetPresent: true, before: null, after, delta: diffSliceModel(null, after), guardrail: { status: "failed", diagnostics: ["<script>"], unused: ["a->b"] }, diagramXml: "" });
  assert.doesNotMatch(failed, /<script>/);
  assert.match(failed, /&lt;script&gt;/);
  assert.match(failed, /Guardrail failed/);
  assert.match(failed, /Allowed but unused: a-&gt;b/);
  const passed = sliceHtml({ base: "b", target: "t", basePresent: true, targetPresent: true, before: after, after, delta: null, guardrail: { status: "passed", diagnostics: [], unused: [] }, diagramXml: "" });
  assert.match(passed, /Slice guardrail passed/);
  assert.match(passed, /Comparison unavailable/);
});
