const { test, before, beforeEach, afterEach, describe } = require("node:test");
const assert = require("node:assert/strict");
let report;
before(async () => { await require("./parallel-barrier.cjs")("one", "two"); report = await import(require("node:url").pathToFileURL(require("node:path").resolve(process.env.SPIKE_TARGET)).href); });
beforeEach(() => { report.reportJson({ goal: "setup", verdict: "UNKNOWN" }); });
afterEach(() => { report.reportJson({ goal: "teardown", verdict: "UNKNOWN" }); });
describe("nested one", () => {
  test("duplicate", () => { assert.match(report.reportMarkdown({ goal: "one", verdict: "UNKNOWN" }), /Verification Report/); });
});
describe("nested three", () => {
  test("duplicate", () => { assert.match(report.reportJson({ goal: "three", verdict: "UNKNOWN" }), /schemaVersion/); });
});
