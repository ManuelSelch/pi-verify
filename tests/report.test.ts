import assert from "node:assert/strict";
import test from "node:test";
import { reportJson, reportMarkdown, type VerificationReport } from "../src/report.js";

test("JSON preserves added tests and checks", () => {
  const report: VerificationReport = {
    goal: "Fix calculator",
    verdict: "VERIFIED",
    tests: [{ name: "test_add", file: "test_calculator.py", behavior: "positive inputs", outcome: "passed", evidence: ["EV-001"] }],
    checks: [{ command: "python3 -m unittest", outcome: "passed", exitCode: 0, evidence: "EV-001" }],
  };
  const parsed = JSON.parse(reportJson(report));
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.tests[0].name, "test_add");
  assert.equal(parsed.checks[0].exitCode, 0);
});

test("Markdown renders unknown and skipped results", () => {
  const markdown = reportMarkdown({
    goal: "Docs-only task",
    verdict: "PARTIAL",
    tests: [{ name: "test_unknown", file: "test.py", behavior: "behavior", outcome: "unknown" }],
    checks: [{ command: "npm test", outcome: "skipped", note: "not relevant" }],
    limitations: ["No test runner was configured."],
  });
  assert.match(markdown, /## Added and modified tests/);
  assert.match(markdown, /test_unknown/);
  assert.match(markdown, /unknown/);
  assert.match(markdown, /No test runner was configured\./);
});
