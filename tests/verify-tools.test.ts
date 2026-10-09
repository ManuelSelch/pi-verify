import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createVerificationTools } from "../src/verify-tools.js";

test("prompt-first verification uses attach and finish without low-level lifecycle calls", async () => {
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
    const screenshot = path.join(artifactRoot, "screenshot.png");
    await writeFile(screenshot, "fake screenshot artifact");
    const attached = await call("verify_attach", { path: screenshot, type: "screenshot", label: "Addition screenshot", description: "UI screenshot for verification" });
    const attachedDetails = attached.details as { path: string; source: string; sha256: string; size: number };
    assert.notEqual(attachedDetails.path, attachedDetails.source);
    assert.equal(attachedDetails.size, 24);
    assert.match(attachedDetails.sha256, /^[a-f0-9]{64}$/);
    const summary = {
      goal: "Verify addition in sum.cjs",
      changes: [{ file: "sum.cjs", summary: "Adds two numbers" }],
      tests: [{ name: "addition", file: "sum.test.cjs", behavior: "2 + 3 is 5", outcome: "unknown" }],
      checks: [{ command: "node sum.test.cjs", cwd: root, outcome: "passed", exitCode: 0, note: "Addition smoke test passed" }],
      skipped: ["No broader suite was run because the task is isolated to the sum helper."],
      limitations: ["This is a minimal smoke check, not a broad regression run."],
    };
    const finished = await call("verify_finish", summary);
    const details = finished.details as { verdict: string; reportPaths: { jsonPath: string; markdownPath: string } };
    assert.equal(details.verdict, "VERIFIED");
    const report = JSON.parse(await readFile(details.reportPaths.jsonPath, "utf8"));
    assert.equal(report.checks.length, 1);
    assert.equal(report.artifacts.some((artifact: { label: string; type?: string }) => artifact.label === "Addition screenshot" && artifact.type === "screenshot"), true);
    assert.equal(report.tests[0].outcome, "unknown");
    assert.deepEqual(report.changes, summary.changes);
    assert.equal(report.source.clean, true);
    assert.deepEqual(report.commits.map((commit: { subject: string }) => commit.subject), ["add sum demo"]);
    const markdown = await readFile(details.reportPaths.markdownPath, "utf8");
    assert.match(markdown, /## Summary/);
    assert.match(markdown, /## Evidence/);
    assert.match(report.artifacts[0].path, /screenshot\.png$/);
    await writeFile(path.join(root, "leftover.tmp"), "untracked\n");
    const dirty = await call("verify_finish", { ...summary, goal: "Verify dirty working tree" });
    assert.equal((dirty.details as { verdict: string }).verdict, "VERIFIED");
    const dirtyReport = JSON.parse(await readFile((dirty.details as { reportPaths: { jsonPath: string } }).reportPaths.jsonPath, "utf8"));
    assert.deepEqual(dirtyReport.source.untracked, ["leftover.tmp"]);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

test("verify_finish accepts a goal and does not enforce non-empty strings", async () => {
  const tool = createVerificationTools(() => process.cwd(), {}).find((item) => item.name === "verify_finish");
  assert.ok(tool);
  const result = await tool.execute("1", { goal: "" }, new AbortController().signal, undefined, { cwd: process.cwd() });
  assert.ok(result.details);
});
