import test from "node:test";
import assert from "node:assert/strict";
import { parseConfiguration } from "../src/config.js";

test("an absent configuration disables the architecture check", () => {
  assert.deepEqual(parseConfiguration(null), { architecture: null });
});

test("parses the architecture section", () => {
  assert.deepEqual(parseConfiguration(JSON.stringify({ architecture: { diagram: "docs/architecture.drawio", root: "src", strict: true } })), {
    architecture: { diagram: "docs/architecture.drawio", root: "src", strict: true },
  });
});

test("strict defaults to false and null or a missing key disables", () => {
  assert.equal(parseConfiguration(JSON.stringify({ architecture: { diagram: "docs/a.drawio", root: "src" } })).architecture?.strict, false);
  assert.deepEqual(parseConfiguration(JSON.stringify({ architecture: null })), { architecture: null });
  assert.deepEqual(parseConfiguration("{}"), { architecture: null });
});

test("rejects unknown fields, invalid paths and invalid types", () => {
  assert.throws(() => parseConfiguration(JSON.stringify({ unknown: {} })), /unknown fields/);
  assert.throws(() => parseConfiguration(JSON.stringify({ architecture: { diagram: "docs/a.drawio", root: "src", extra: 1 } })), /unknown fields/);
  assert.throws(() => parseConfiguration(JSON.stringify({ architecture: { diagram: "../outside.drawio", root: "src" } })), /repository-relative/);
  assert.throws(() => parseConfiguration(JSON.stringify({ architecture: { diagram: "docs/a.drawio", root: "src", strict: "yes" } })), /boolean/);
  assert.throws(() => parseConfiguration("{"));
});
