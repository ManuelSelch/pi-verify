import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeArchitectureDiagram } from "../src/architecture/write.js";
import { checkWorkingTree } from "../src/architecture/check.js";
import type { ArchitectureConfiguration } from "../src/config.js";

const configuration: ArchitectureConfiguration = { diagram: "docs/architecture.drawio", root: "src", strict: false, slices: ["*"], transitive: false };

function scratch(t: TestContext) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "architecture-write-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (file: string, content: string) => {
    const destination = path.join(dir, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  };
  const read = (file: string) => readFileSync(path.join(dir, file), "utf8");
  return { dir, write, read };
}

const source = (write: (file: string, content: string) => void) => {
  write("src/domain/model.ts", `import { table } from "../infra/db"; export const owners = table("owners");`);
  write("src/infra/db.ts", `export function table(name: string) { return name; }`);
};

test("writes a diagram from the code and keeps it stable on a second run", (t) => {
  const { dir, write, read } = scratch(t);
  source(write);
  const first = writeArchitectureDiagram(dir, configuration);
  assert.equal(first.changed, true);
  assert.deepEqual(first.addedSlices, ["domain", "infra"]);
  assert.deepEqual(first.addedEdges, ["domain->infra"]);
  assert.deepEqual(first.stagedSlices, ["domain", "infra"]);
  const xml = read("docs/architecture.drawio");
  assert.match(xml, /concept="domain"/);
  assert.match(xml, /assoc="domain->infra"/);
  assert.match(xml, /placed="auto" autoAt="/);
  assert.deepEqual(checkWorkingTree(dir, configuration).errors, []);
  assert.equal(writeArchitectureDiagram(dir, configuration).changed, false);
});

test("a moved staged box keeps its new position and loses the marker", (t) => {
  const { dir, write, read } = scratch(t);
  source(write);
  writeArchitectureDiagram(dir, configuration);
  const moved = read("docs/architecture.drawio").replace(/(id="box-domain"[^>]*>.*?<mxGeometry x=")20(")/s, "$1450$2");
  write("docs/architecture.drawio", moved);
  const result = writeArchitectureDiagram(dir, configuration);
  assert.deepEqual(result.stagedSlices, ["infra"]);
  const xml = read("docs/architecture.drawio");
  assert.match(xml, /id="box-domain"[^>]*>\s*<mxCell[^>]*>\s*<mxGeometry x="450"/);
  assert.doesNotMatch(xml.match(/id="box-domain".*/s)![0].split("</object>")[0], /placed="auto"/);
});

test("accept keeps the position but clears the marker, without moving a box", (t) => {
  const { dir, write, read } = scratch(t);
  source(write);
  writeArchitectureDiagram(dir, configuration);
  assert.match(read("docs/architecture.drawio"), /placed="auto"/);
  const result = writeArchitectureDiagram(dir, configuration, { accept: true });
  assert.deepEqual(result.stagedSlices, []);
  const xml = read("docs/architecture.drawio");
  assert.doesNotMatch(xml, /placed="auto"/);
  assert.doesNotMatch(xml, /dashed=1/);
  assert.deepEqual(checkWorkingTree(dir, configuration).errors, []);
});

test("removes a slice whose folder disappears", (t) => {
  const { dir, write, read } = scratch(t);
  source(write);
  writeArchitectureDiagram(dir, configuration);
  write("src/domain/model.ts", `export const owners = 1;`);
  rmSync(path.join(dir, "src/infra"), { recursive: true, force: true });
  const result = writeArchitectureDiagram(dir, configuration);
  assert.deepEqual(result.removedSlices, ["infra"]);
  assert.doesNotMatch(read("docs/architecture.drawio"), /concept="infra"/);
});

test("writes the transitive reduction when the configuration asks for it", (t) => {
  const { dir, write, read } = scratch(t);
  write("src/a/one.ts", `import "../b/two"; import "../c/three"; export const one = 1;`);
  write("src/b/two.ts", `import "../c/three"; export const two = 1;`);
  write("src/c/three.ts", `export const three = 1;`);
  const transitive = { ...configuration, transitive: true };
  writeArchitectureDiagram(dir, transitive);
  const xml = read("docs/architecture.drawio");
  assert.match(xml, /assoc="a->b"/);
  assert.match(xml, /assoc="b->c"/);
  assert.doesNotMatch(xml, /assoc="a->c"/);
  assert.deepEqual(checkWorkingTree(dir, transitive).errors, []);
  assert.match(checkWorkingTree(dir, configuration).errors.join(" "), /undeclared association a->c/);
});
