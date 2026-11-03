import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { approveArchitecture } from "../src/architecture/approve.js";
import { writeArchitectureDiagram } from "../src/architecture/write.js";
import type { ArchitectureConfiguration } from "../src/config.js";

const configuration: ArchitectureConfiguration = { diagram: "docs/architecture.drawio", root: "src", strict: false, slices: ["*"], transitive: false };

function repository(t: TestContext): { dir: string; git: (...args: string[]) => string; write: (file: string, content: string) => void; read: (file: string) => string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "architecture-approve-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  const write = (file: string, content: string) => {
    const destination = path.join(dir, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  };
  const read = (file: string) => readFileSync(path.join(dir, file), "utf8");
  write("seed", "seed"); git("add", "."); git("commit", "-qm", "base");
  return { dir, git, write, read };
}

test("approve commits only the architecture files and leaves unrelated work uncommitted", async (t) => {
  const { dir, git, write, read } = repository(t);
  write(".pi/pi-verify.json", JSON.stringify({ architecture: { diagram: "docs/architecture.drawio", root: "src" } }));
  write("src/domain/model.ts", `import { table } from "../infra/db"; export const owners = table("owners");`);
  write("src/infra/db.ts", `export function table(name: string) { return name; }`);
  writeArchitectureDiagram(dir, configuration);
  write("seed", "changed");
  assert.match(read("docs/architecture.drawio"), /placed="auto"/);

  const approval = await approveArchitecture(dir);
  assert.equal(approval.ok, true);
  assert.equal(approval.committed, true);

  const committed = git("show", "--pretty=format:", "--name-only", "HEAD").split("\n").filter(Boolean).sort();
  assert.deepEqual(committed, [".pi/pi-verify.json", "docs/architecture.drawio"]);
  assert.doesNotMatch(read("docs/architecture.drawio"), /placed="auto"/);
  assert.equal(git("diff", "--name-only", "--", "seed"), "seed");
  assert.equal(git("diff", "--cached", "--name-only", "--", "seed"), "");
  assert.equal(git("status", "--porcelain", "--", "src"), "?? src/");
  assert.equal(git("remote"), "");

  const again = await approveArchitecture(dir);
  assert.equal(again.committed, false);
  assert.match(again.message, /already committed/);
});

test("approve without architecture configuration reports that it is not configured", async (t) => {
  const { dir } = repository(t);
  const approval = await approveArchitecture(dir);
  assert.equal(approval.ok, false);
  assert.match(approval.message, /not configured/);
});
