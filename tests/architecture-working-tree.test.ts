import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkWorkingTree } from "../src/architecture/check.js";
import { readArchitectureSource } from "../src/architecture/model.js";

function scratch(t: TestContext) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "architecture-working-tree-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (file: string, content: string) => {
    const destination = path.join(dir, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  };
  return { dir, write };
}

const drawing = (slices: string[], edges: string[]) => `<mxfile><diagram><mxGraphModel><root>${slices.map(slice => `<object id="box-${slice}" concept="${slice}" label="${slice}"><mxCell vertex="1"><mxGeometry x="0" y="0" width="140" height="50"/></mxCell></object>`).join("")}${edges.map(edge => { const [from, to] = edge.split("->"); return `<object id="edge-${from}-${to}" assoc="${from}->${to}"><mxCell edge="1" source="box-${from}" target="box-${to}"/></object>`; }).join("")}</root></mxGraphModel></diagram></mxfile>`;

const defaultConfiguration = { diagram: "docs/architecture.drawio", root: "src", strict: false, slices: ["*"], transitive: false };

test("readArchitectureSource reads only TypeScript sources and skips tests", (t) => {
  const { dir, write } = scratch(t);
  write("src/domain/model.ts", "export const model = 1;");
  write("src/domain/model.test.ts", "export const leaked = 1;");
  write("src/domain/notes.md", "# no");
  write("src/domain/index.tsx", "export const view = 1;");
  assert.deepEqual([...readArchitectureSource(path.join(dir, "src")).files.keys()].sort(), ["domain/index.tsx", "domain/model.ts"]);
});

test("checkWorkingTree accepts a matching tree and reports an undeclared dependency", (t) => {
  const { dir, write } = scratch(t);
  const configuration = defaultConfiguration;
  write("docs/architecture.drawio", drawing(["domain", "infra"], ["domain->infra"]));
  write("src/domain/model.ts", `import { table } from "../infra/db"; export const owners = table("owners");`);
  write("src/infra/db.ts", `export function table(name: string) { return name; }`);
  assert.deepEqual(checkWorkingTree(dir, configuration), { errors: [], unused: [] });
  write("src/infra/db.ts", `import { owners } from "../domain/model"; export const table = owners;`);
  assert.match(checkWorkingTree(dir, configuration).errors.join(" "), /undeclared association infra->domain/);
});

test("checkWorkingTree follows tsconfig path aliases", (t) => {
  const { dir, write } = scratch(t);
  write("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }));
  write("docs/architecture.drawio", drawing(["app", "components"], ["app->components"]));
  write("src/app/page.ts", `import { Button } from "@/components/button"; export const page = Button;`);
  write("src/components/button.ts", `export const Button = 1;`);
  assert.deepEqual(checkWorkingTree(dir, defaultConfiguration), { errors: [], unused: [] });
});

test("checkWorkingTree fails loudly on a missing diagram", (t) => {
  const { dir, write } = scratch(t);
  write("src/domain/model.ts", "export const model = 1;");
  assert.throws(() => checkWorkingTree(dir, defaultConfiguration), /not found/);
});
