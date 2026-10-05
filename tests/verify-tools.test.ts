import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createVerificationTools } from "../src/verify-tools.js";

test("disposable addition project supports reviews and automatic reports", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-verify-addition-demo-"));
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "pi-verify-artifacts-"));
  try {
    await writeFile(path.join(root, "sum.cjs"), "exports.sum = (a, b) => a + b;\n");
    await writeFile(path.join(root, "sum.test.cjs"), "const {sum} = require('./sum.cjs'); require('node:assert/strict').equal(sum(2, 3), 5); console.log('addition passed');\n");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const exec = promisify(execFile);
    for (const args of [["init", "-b", "main"], ["config", "user.email", "test@example.com"], ["config", "user.name", "Test"], ["add", "."], ["commit", "-m", "add sum demo"]]) await exec("git", args, { cwd: root });
    const tools = createVerificationTools(() => root, {});
    const finishTool = tools.find((item) => item.name === "verify_finish")!;
    assert.equal(Object.hasOwn((finishTool.parameters as { properties: object }).properties, "source"), false);
    const call = (name: string, params: unknown) => {
      const tool = tools.find((item) => item.name === name);
      assert.ok(tool, `${name} is registered`);
      return tool.execute(name, params, new AbortController().signal, undefined, { cwd: root });
    };
    const started = await call("verify_start", { goal: "Verify addition in sum.cjs" });
    const screenshot = path.join(artifactRoot, "screenshot.png");
    await writeFile(screenshot, "fake screenshot artifact");
    const attached = await call("verify_attach", { path: screenshot, type: "screenshot", label: "Addition screenshot" });
    const attachedDetails = attached.details as { path: string; source: string; sha256: string; size: number };
    assert.notEqual(attachedDetails.path, attachedDetails.source);
    assert.equal(attachedDetails.size, 24);
    assert.match(attachedDetails.sha256, /^[a-f0-9]{64}$/);
    assert.equal((started.details as { acceptance: { criteria: unknown[] } }).acceptance.criteria.length, 3);
    const commands = ["printf 'Goal: verify addition'", "node -p \"require('fs').readFileSync('sum.cjs', 'utf8')\"", "node sum.test.cjs"];
    for (const [index, type] of ["file-read", "diff", "test"].entries()) {
      const criterion = `AC-00${index + 1}`;
      const result = await call("verify_add_evidence", { criterion, type, command: commands[index] });
      const data = result.details as { evidence: string; artifactPath: string; output: string };
      assert.ok(data.output.length > 0);
      assert.ok(await readFile(data.artifactPath, "utf8"));
    }
    const before = await call("verify_finish", {});
    const beforeDetails = before.details as { gate: { verdict: string }; reportPaths: { jsonPath: string; markdownPath: string } };
    assert.equal(beforeDetails.gate.verdict, "NOT VERIFIED");
    const unreviewed = JSON.parse(await readFile(beforeDetails.reportPaths.jsonPath, "utf8"));
    assert.equal(unreviewed.checks[0].exitCode, 0);
    assert.equal(unreviewed.criteria.length, 3);
    for (let index = 1; index <= 3; index++) {
      await call("verify_review", { criterion: `AC-00${index}`, evidence: `EV-00${index}`, verdict: "supports", notes: "Self-review: inspected captured output against the criterion." });
    }
    const summary = {
      changes: [{ file: "sum.cjs", summary: "Adds two numbers" }],
      tests: [{ name: "addition", file: "sum.test.cjs", behavior: "2 + 3 is 5", outcome: "unknown" }],
      skipped: ["Git comparison unavailable: standalone fixture"],
    };
    const finished = await call("verify_finish", summary);
    const details = finished.details as typeof beforeDetails;
    assert.equal(details.gate.verdict, "VERIFIED");
    const report = JSON.parse(await readFile(details.reportPaths.jsonPath, "utf8"));
    assert.equal(report.checks.length, 3);
    assert.equal(report.artifacts.some((artifact: { label: string; type?: string }) => artifact.label === "Addition screenshot" && artifact.type === "screenshot"), true);
    assert.equal(report.executedTests.length, 1);
    assert.equal(report.tests[0].outcome, "unknown");
    assert.deepEqual(report.changes, summary.changes);
    assert.equal(report.review.kind, "self-review");
    assert.equal(report.review.records.reviews.length, 3);
    assert.equal(report.gate.allowed, true);
    assert.equal(report.source.clean, true);
    assert.deepEqual(report.commits.map((commit: { subject: string }) => commit.subject), ["add sum demo"]);
    assert.equal(report.artifacts.filter((item: { label: string }) => item.label.startsWith("EV-")).length, 3);
    const markdown = await readFile(details.reportPaths.markdownPath, "utf8");
    assert.match(markdown, /## Summary/);
    assert.match(markdown, /## Evidence/);
    assert.doesNotMatch(markdown, /## Checks/);
    assert.doesNotMatch(markdown, /Executed test commands/);
    assert.match(report.artifacts[0].path, /\/report-.*\.md$/);
    await call("verify_review", { criterion: "AC-003", evidence: "EV-003", verdict: "does-not-support", notes: "Direct addition does not cover other numeric cases." });
    const rejected = await call("verify_finish", {});
    assert.equal((rejected.details as typeof details).gate.verdict, "PARTIALLY VERIFIED");
    await writeFile(path.join(root, "leftover.tmp"), "untracked\n");
    const dirty = await call("verify_finish", {});
    assert.equal((dirty.details as { verdict: string }).verdict, "NOT VERIFIED");
    const dirtyReport = JSON.parse(await readFile((dirty.details as typeof details).reportPaths.jsonPath, "utf8"));
    assert.deepEqual(dirtyReport.source.untracked, ["leftover.tmp"]);
    await rm(path.join(root, "leftover.tmp"));
    const failed = await call("verify_add_evidence", { criterion: "AC-003", type: "test", command: "node -e 'process.exit(2)'" });
    assert.equal((failed.details as { exitCode: number }).exitCode, 2);
    const last = await call("verify_finish", {});
    const failureReport = JSON.parse(await readFile((last.details as typeof details).reportPaths.jsonPath, "utf8"));
    assert.equal(failureReport.checks.at(-1).outcome, "failed");
    assert.equal(failureReport.executedTests.at(-1).exitCode, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

test("review requires an active run", async () => {
  const tool = createVerificationTools(() => process.cwd(), {}).find((item) => item.name === "verify_review");
  assert.ok(tool);
  await assert.rejects(tool.execute("1", {}, new AbortController().signal, undefined, {}), /verify_start/);
});
