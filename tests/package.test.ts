import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Pi loads the tracked TypeScript extension source", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.deepEqual(packageJson.pi.extensions, ["./src/extension.ts"]);
  assert.ok(packageJson.files.includes("src"));
});
