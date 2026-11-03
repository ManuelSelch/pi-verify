import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openArchitectureDiagram } from "../src/architecture/open.js";

function scratch(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "architecture-open-"));
  mkdirSync(path.join(dir, ".pi"), { recursive: true });
  return dir;
}

test("open reports an unconfigured or missing diagram instead of launching an editor", async (t) => {
  const dir = scratch();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const unconfigured = await openArchitectureDiagram(dir);
  assert.equal(unconfigured.ok, false);
  assert.match(unconfigured.message, /not configured/);

  writeFileSync(path.join(dir, ".pi/pi-verify.json"), JSON.stringify({ architecture: { diagram: "docs/architecture.drawio", root: "src" } }));
  const missing = await openArchitectureDiagram(dir);
  assert.equal(missing.ok, false);
  assert.match(missing.message, /docs\/architecture\.drawio/);
});
