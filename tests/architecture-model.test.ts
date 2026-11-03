import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { aliasesFromConfig, checkArchitecture, codeArchitectureModel, diagramArchitectureModel, diffArchitectureModel, unusedEdges } from "../src/architecture/model.js";
import { architectureHtml } from "../src/architecture/html.js";

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
  const model = codeArchitectureModel({ files: source });
  assert.deepEqual(model.slices.map(slice => slice.name), ["domain", "infra", "report", "ui"]);
  assert.deepEqual(model.edges.map(edge => edge.key), dependencies);
});

test("resolves tsconfig path aliases into cross-folder edges", () => {
  const base = path.resolve("/tmp/pi-verify-alias-project");
  const model = codeArchitectureModel({
    files: files({
      "app/page.ts": `import { Button } from "@/components/button"; export const page = Button;`,
      "components/button.ts": `import { theme } from "@/config/theme"; export const Button = theme;`,
      "config/theme.ts": `export const theme = 1;`,
    }),
    root: path.join(base, "src"),
    aliases: [{ pattern: "@/*", targets: ["./src/*"] }],
    aliasBase: base,
  });
  assert.deepEqual(model.edges.map(edge => edge.key), ["app->components", "components->config"]);
});

test("groups nested folders into slices with ordered prefix patterns", () => {
  const base = path.resolve("/tmp/pi-verify-alias-project");
  const model = codeArchitectureModel({
    files: files({
      "app/page.ts": `import { getBriefing } from "@/features/briefing/api/get-briefing"; export const page = getBriefing;`,
      "features/briefing/api/get-briefing.ts": `import { Button } from "@/components/button"; export const getBriefing = Button;`,
      "features/projects/api/get-projects.ts": `import { client } from "@/lib/client"; export const getProjects = client;`,
      "components/button.ts": `export const Button = 1;`,
      "lib/client.ts": `export const client = 1;`,
    }),
    root: path.join(base, "src"),
    aliases: [{ pattern: "@/*", targets: ["./src/*"] }],
    aliasBase: base,
  }, { slices: ["features/*", "*"] });
  assert.deepEqual(model.slices.map(slice => slice.name), ["app", "components", "features/briefing", "features/projects", "lib"]);
  assert.deepEqual(model.edges.map(edge => edge.key), ["app->features/briefing", "features/briefing->components", "features/projects->lib"]);
});

test("reads tsconfig compilerOptions.paths and ignores a configuration without paths", () => {
  const base = path.resolve("/tmp/pi-verify-alias-project");
  assert.deepEqual(aliasesFromConfig("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }), base), { aliases: [{ pattern: "@/*", targets: ["./src/*"] }], aliasBase: base });
  assert.equal(aliasesFromConfig("tsconfig.json", "{}", base), null);
});

test("resolves emitted .js specifiers back to their TypeScript source", () => {
  const model = codeArchitectureModel({ files: files({ "a/one.ts": `import { two } from "../b/two.js"; export const one = two;`, "b/two.ts": `export const two = 2;` }) });
  assert.deepEqual(model.edges.map(edge => edge.key), ["a->b"]);
});

test("a matching diagram passes and geometry is ignored", () => {
  const code = codeArchitectureModel({ files: source });
  const after = diagramArchitectureModel(drawing(allowed, dependencies));
  assert.deepEqual(checkArchitecture(code, after), []);
  const moved = diagramArchitectureModel(drawing(allowed, dependencies).replaceAll('x="0"', 'x="300"'));
  assert.deepEqual(diffArchitectureModel(after, moved), { added: [], removed: [], changed: [] });
});

test("reports missing slices, extra slices and undeclared dependencies", () => {
  const code = codeArchitectureModel({ files: source });
  const missing = checkArchitecture(code, diagramArchitectureModel(drawing(["domain", "infra", "report"], ["report->domain", "ui->report"]))).join(" ");
  assert.match(missing, /missing slice ui/);
  assert.match(missing, /undeclared association domain->infra/);
  const extra = checkArchitecture(code, diagramArchitectureModel(drawing([...allowed, "legacy"], dependencies))).join(" ");
  assert.match(extra, /extra slice legacy/);
});

test("an allowed but unused arrow is reported, not failed, unless strict", () => {
  const code = codeArchitectureModel({ files: source });
  const diagram = diagramArchitectureModel(drawing(allowed, [...dependencies, "ui->domain"]));
  assert.deepEqual(checkArchitecture(code, diagram), []);
  assert.deepEqual(unusedEdges(code, diagram), ["ui->domain"]);
  assert.match(checkArchitecture(code, diagram, { strict: true }).join(" "), /unused association ui->domain/);
});

test("transitive mode accepts a dependency the diagram implies through a path", () => {
  const code = codeArchitectureModel({ files: files({
    "a/one.ts": `import "../b/two"; import "../c/three"; export const one = 1;`,
    "b/two.ts": `import "../c/three"; export const two = 1;`,
    "c/three.ts": `export const three = 1;`,
  }) });
  const diagram = diagramArchitectureModel(drawing(["a", "b", "c"], ["a->b", "b->c"]));
  assert.match(checkArchitecture(code, diagram).join(" "), /undeclared association a->c/);
  assert.deepEqual(checkArchitecture(code, diagram, { transitive: true }), []);
  assert.match(checkArchitecture(code, diagramArchitectureModel(drawing(["a", "b", "c"], ["a->b"])), { transitive: true }).join(" "), /undeclared association b->c/);
});

test("rejects undeclared lines, wrong identities and mismatched labels", () => {
  const code = codeArchitectureModel({ files: source });
  assert.match(checkArchitecture(code, diagramArchitectureModel(drawing(allowed, dependencies, { declare: false }))).join(" "), /undeclared association/);
  assert.match(checkArchitecture(code, diagramArchitectureModel(drawing(allowed, dependencies, { label: slice => slice === "domain" ? "Domain layer" : slice }))).join(" "), /label does not match/);
  assert.throws(() => diagramArchitectureModel("<mxfile><diagram>"), /Invalid/);
  assert.throws(() => diagramArchitectureModel("<mxfile><diagram/><diagram/></mxfile>"), /Multiple/);
  assert.match(checkArchitecture(code, diagramArchitectureModel(`<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`)).join(" "), /no slices/);
});

test("diff highlights added, removed and changed slices and arrows", () => {
  const before = diagramArchitectureModel(drawing(["domain"], []));
  const after = diagramArchitectureModel(drawing(["domain", "infra"], [], { label: slice => slice === "domain" ? "Core" : slice }));
  assert.deepEqual(diffArchitectureModel(before, after), { added: ["slice infra"], removed: [], changed: ["slice domain"] });
  assert.deepEqual(diffArchitectureModel(after, before), { added: [], removed: ["slice infra"], changed: ["slice domain"] });
  assert.deepEqual(diffArchitectureModel(null, before).added, ["slice domain"]);
});

test("arrows stop at the box borders so their heads stay visible", () => {
  const xml = `<mxfile><diagram><mxGraphModel><root><object id="box-math" concept="math" label="math"><mxCell vertex="1"><mxGeometry x="0" y="0" width="140" height="50"/></mxCell></object><object id="box-util" concept="util" label="util"><mxCell vertex="1"><mxGeometry x="150" y="0" width="140" height="50"/></mxCell></object><object id="e" assoc="math->util"><mxCell edge="1" source="box-math" target="box-util"/></object></root></mxGraphModel></diagram></mxfile>`;
  const after = diagramArchitectureModel(xml);
  const html = architectureHtml({ base: "b", target: "t", basePresent: true, targetPresent: true, before: null, after, delta: { added: [], removed: [], changed: [] }, guardrail: { status: "passed", diagnostics: [], unused: [] }, diagramXml: xml });
  const line = html.match(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/);
  assert.ok(line, "expected a rendered arrow line");
  const [x1, x2] = [Number(line[1]), Number(line[3])];
  assert.ok(x1 > 140, `arrow should start after the math box, got ${x1}`);
  assert.ok(x2 < 150, `arrow should stop before the util box, got ${x2}`);
});

test("architecture report marks slices awaiting human placement", () => {
  const xml = `<mxfile><diagram><mxGraphModel><root><object id="box-a" concept="a" label="a" placed="auto" autoAt="0,0"><mxCell vertex="1"><mxGeometry x="0" y="0" width="140" height="50"/></mxCell></object></root></mxGraphModel></diagram></mxfile>`;
  const after = diagramArchitectureModel(xml);
  const html = architectureHtml({ base: "b", target: "t", basePresent: false, targetPresent: true, before: null, after, delta: null, guardrail: { status: "passed", diagnostics: [], unused: [] }, diagramXml: xml });
  assert.match(html, /Awaiting human placement: a/);
  assert.match(html, /stroke-dasharray="5 3"/);
});

test("architecture report links the diagram for editing", () => {
  const xml = drawing(["a"], []);
  const after = diagramArchitectureModel(xml);
  const review = { base: "b", target: "t", basePresent: true, targetPresent: true, before: null, after, delta: null, guardrail: { status: "passed" as const, diagnostics: [], unused: [] }, diagramXml: xml, sourcePath: "/repo/docs/architecture.drawio" };
  const html = architectureHtml(review);
  assert.match(html, /href="vscode:\/\/file\/repo\/docs\/architecture\.drawio"/);
  assert.match(html, /\/verify approve/);
  assert.doesNotMatch(architectureHtml({ ...review, sourcePath: null }), /vscode:\/\/file/);
});

test("architecture report escapes diagram labels and states its guardrail", () => {
  const after = diagramArchitectureModel(drawing(["<script>"], []));
  const failed = architectureHtml({ base: "b", target: "t", basePresent: true, targetPresent: true, before: null, after, delta: diffArchitectureModel(null, after), guardrail: { status: "failed", diagnostics: ["<script>"], unused: ["a->b"] }, diagramXml: "" });
  assert.doesNotMatch(failed, /<script>/);
  assert.match(failed, /&lt;script&gt;/);
  assert.match(failed, /Guardrail failed/);
  assert.match(failed, /Allowed but unused: a-&gt;b/);
  const passed = architectureHtml({ base: "b", target: "t", basePresent: true, targetPresent: true, before: after, after, delta: null, guardrail: { status: "passed", diagnostics: [], unused: [] }, diagramXml: "" });
  assert.match(passed, /Architecture guardrail passed/);
  assert.match(passed, /Comparison unavailable/);
});
