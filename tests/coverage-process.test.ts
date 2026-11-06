import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { coverageProcessEnvironment, coverageProcessRoot } from "./support/coverage-process.js";

test("coverage subprocesses get fresh instrumentation state without mutating the parent", () => {
  const parent = { PATH: "bin", HOME: "home", SUPERCOV_PROJECT_ROOT: "/instrumented", SUPERCOV_SOURCE_PROJECT_ROOT: "/original", SUPERCOV_RUN_ID: "outer", SUPERCOV_RUN_ID_FILE: "/outer/id", NODE_OPTIONS: "--import=outer-runtime", NODE_TEST_CONTEXT: "child-v8", NODE_V8_COVERAGE: "/outer/coverage" };

  const child = coverageProcessEnvironment(parent);

  assert.equal(child.PATH, "bin");
  assert.equal(child.HOME, "home");
  assert.equal(child.SUPERCOV_INTERNAL_ENGINE, "1");
  assert.deepEqual(Object.keys(child).filter(key => key.startsWith("SUPERCOV_")), ["SUPERCOV_INTERNAL_ENGINE"]);
  assert.equal(child.NODE_OPTIONS, undefined);
  assert.equal(child.NODE_TEST_CONTEXT, undefined);
  assert.equal(child.NODE_V8_COVERAGE, undefined);
  assert.equal(parent.SUPERCOV_RUN_ID, "outer");
  assert.equal(coverageProcessRoot(parent), path.resolve("/original"));
});

test("normal runs need no Supercov engine boundary and use the current project", () => {
  const child = coverageProcessEnvironment({ PATH: "bin" });

  assert.deepEqual(child, { PATH: "bin" });
  assert.equal(coverageProcessRoot({}), path.resolve(process.cwd()));
});
