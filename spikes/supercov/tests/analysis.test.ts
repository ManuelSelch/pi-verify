import assert from "node:assert/strict";
import test from "node:test";
import { testDefinitions, functionContext, changedLineNumbers, diffLines } from "../src/analysis.ts";

test("distinguishes nested test names and extracts complete test definitions", () => {
  const source = `describe("left", () => { test("same", () => { work(); }); });\ndescribe("right", () => { test("same", () => { other(); }); });`;
  const result = testDefinitions("tests/example.test.ts", source);

  assert.deepEqual(result.map(item => item.name), ["left > same", "right > same"]);
  assert.equal(result[0].source, 'test("same", () => { work(); })');
  assert.equal(result[1].line, 2);
});

test("uses changed hunk coordinates on the target side, excluding deletions", () => {
  const diff = "@@ -2,2 +2,3 @@\n-old\n+new\n+added\n context\n@@ -9 +10,0 @@\n-deleted";

  assert.deepEqual(changedLineNumbers(diff), [2, 3]);
});

test("returns the whole enclosing function without claiming its context executed", () => {
  const text = "// heading\nexport function price(n: number) {\n  if (n < 0) {\n    return 0;\n  }\n  return n;\n}\n";

  assert.deepEqual(functionContext("src/a.ts", text, 4), {
    file: "src/a.ts", startLine: 2, endLine: 7,
    source: text.split("\n").slice(1, 7).join("\n"),
  });
});

test("a test diff preserves unchanged context and distinguishes additions from removals", () => {
  const before = "test(() => {\n  old();\n});";
  const after = "test(() => {\n  newer();\n});";

  assert.deepEqual(diffLines(before, after), [
    { kind: "context", text: "test(() => {" },
    { kind: "removed", text: "  old();" },
    { kind: "added", text: "  newer();" },
    { kind: "context", text: "});" },
  ]);
});
