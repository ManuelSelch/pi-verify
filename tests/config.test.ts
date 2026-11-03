import test from "node:test";
import assert from "node:assert/strict";
import { parseConfiguration } from "../src/config.js";

test("an absent configuration keeps the conventional conceptual diagram and no slice check", () => {
  assert.deepEqual(parseConfiguration(null), { conceptualModel: { diagram: "docs/conceptual-model.drawio" }, sliceModel: null });
});

test("parses both sections from one file", () => {
  const configuration = parseConfiguration(JSON.stringify({
    conceptualModel: { diagram: "docs/domain.drawio", source: "src/domain/model.ts" },
    sliceModel: { diagram: "docs/architecture.drawio", root: "src", strict: true },
  }));
  assert.deepEqual(configuration, {
    conceptualModel: { diagram: "docs/domain.drawio", source: "src/domain/model.ts" },
    sliceModel: { diagram: "docs/architecture.drawio", root: "src", strict: true },
  });
});

test("missing keys default and null disables", () => {
  assert.deepEqual(parseConfiguration("{}"), { conceptualModel: { diagram: "docs/conceptual-model.drawio" }, sliceModel: null });
  assert.deepEqual(parseConfiguration(JSON.stringify({ conceptualModel: null })), { conceptualModel: null, sliceModel: null });
  assert.equal(parseConfiguration(JSON.stringify({ sliceModel: { diagram: "docs/a.drawio", root: "src" } })).sliceModel?.strict, false);
});

test("rejects unknown fields, invalid paths and invalid types", () => {
  assert.throws(() => parseConfiguration(JSON.stringify({ unknown: {} })), /unknown fields/);
  assert.throws(() => parseConfiguration(JSON.stringify({ conceptualModel: { diagram: "docs/a.drawio", extra: 1 } })), /unknown fields/);
  assert.throws(() => parseConfiguration(JSON.stringify({ conceptualModel: { diagram: "../outside.drawio" } })), /repository-relative/);
  assert.throws(() => parseConfiguration(JSON.stringify({ sliceModel: { diagram: "docs/a.drawio", root: "src", strict: "yes" } })), /boolean/);
  assert.throws(() => parseConfiguration("{"));
});
