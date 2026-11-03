import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Pi loads the tracked TypeScript extension source", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.deepEqual(packageJson.pi.extensions, ["./src/extension.ts"]);
  assert.ok(packageJson.files.includes("src"));
});

test("public package exposes the scoped CLI and repository metadata", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.name, "@manuelselch/pi-verify");
  assert.equal(manifest.bin["pi-verify"], "./dist/src/cli.js");
  assert.equal(manifest.publishConfig.access, "public");
  assert.equal(manifest.repository.url, "git+https://github.com/ManuelSelch/pi-verify.git");
  assert.ok(manifest.files.includes("dist/src"));
});
