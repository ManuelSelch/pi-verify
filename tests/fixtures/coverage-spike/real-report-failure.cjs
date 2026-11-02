const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let report;
before(async () => { report = await import(require("node:url").pathToFileURL(require("node:path").resolve(process.env.SPIKE_TARGET)).href); });
test("failing example", () => {
  report.reportJson({ goal: "failure", verdict: "UNKNOWN" });
  assert.fail("deliberate failure for coverage spike");
});
