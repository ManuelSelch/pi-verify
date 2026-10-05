import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { reportJson, reportMarkdown, type VerificationReport, writeReportBundle } from "../src/report.js";

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
  assert.match(markdown, /## Added or changed tests/);
  assert.match(markdown, /test_unknown/);
  assert.match(markdown, /unknown/);
  assert.match(markdown, /No test runner was configured\./);
});

test("Markdown renders an executive summary, compact source, simple dates, and file links", () => {
  const markdown = reportMarkdown({
    goal: "Verify addition",
    verdict: "VERIFIED",
    source: {
      repository: "/tmp/demo project",
      branch: "feature/add",
      baseline: "1111111111111111111111111111111111111111",
      baselineMethod: "branch-creation-reflog",
      head: "2222222222222222222222222222222222222222",
      fingerprint: "f".repeat(64),
      clean: true,
      staged: [],
      unstaged: [],
      untracked: [],
    },
    commits: [{ sha: "2222222222222222222222222222222222222222", subject: "Add numbers", author: "Test User", authoredAt: "2026-10-05T15:55:32+02:00" }],
    checks: [{ command: "python3 - <<'PY'\nprint('long command')\nPY", outcome: "passed", exitCode: 0, evidence: "EV-001", note: "Run addition checks" }],
    gate: { passing_criteria: 1, total_criteria: 1 },
    artifacts: [{ label: "EV-001", path: "/tmp/demo project/evidence/EV-001.log" }],
  }, "/tmp/demo project/reports");
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /1\/1 passed/);
  assert.match(markdown, /`222222222222` Add numbers/);
  assert.doesNotMatch(markdown, new RegExp("f{64}"));
  assert.match(markdown, /2026-10-05 15:55/);
  assert.doesNotMatch(markdown, /2026-10-05T15:55:32/);
  assert.match(markdown, /\[EV-001\.log\]\(\.\.\/evidence\/EV-001\.log\)/);
  assert.doesNotMatch(markdown, /file:\/\//);
  assert.doesNotMatch(markdown, /\[\/tmp\/demo project\/evidence/);
  assert.doesNotMatch(markdown, /\| `python3 - <<'PY'/);
  assert.match(markdown, /EV-001\.log/);
  assert.doesNotMatch(markdown, /## Acceptance criteria/);
  assert.doesNotMatch(markdown, /## Gate/);
});

test("writeReportBundle creates durable JSON and Markdown files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-verify-report-"));
  try {
    const paths = await writeReportBundle(root, { goal: "demo", verdict: "VERIFIED" });
    assert.match(await readFile(paths.jsonPath, "utf8"), /schemaVersion/);
    assert.match(await readFile(paths.markdownPath, "utf8"), /Verification Report/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
