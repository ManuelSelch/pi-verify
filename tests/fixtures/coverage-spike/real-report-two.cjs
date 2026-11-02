const { test, before, describe } = require("node:test");
const assert = require("node:assert/strict");
let report;
before(async () => { await require("./parallel-barrier.cjs")("two", "one"); report = await import(require("node:url").pathToFileURL(require("node:path").resolve(process.env.SPIKE_TARGET)).href); });
describe("nested two", () => {
  test("duplicate", () => { assert.match(report.reportJson({ goal: "two", verdict: "UNKNOWN" }), /schemaVersion/); });
});
