import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createVerificationTools } from "../src/verify-tools.js";

test("verification tools wrap an Agent Audits lifecycle", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-verify-tools-"));
  const state: { current?: unknown } = {};
  try {
    const tools = createVerificationTools(() => root, state as never);
    const start = tools.find((tool) => tool.name === "verify_start")!;
    const evidenceTool = tools.find((tool) => tool.name === "verify_add_evidence")!;
    const finish = tools.find((tool) => tool.name === "verify_finish")!;
    const started = await start.execute("1", { goal: "Verify a demo command", projectDir: root }, new AbortController().signal, undefined, { cwd: root });
    const startedDetails = started.details as { auditDir: string; acceptance: { criteria: unknown[] } };
    assert.equal(startedDetails.acceptance.criteria.length, 3);
    const evidence = await evidenceTool.execute("2", { criterion: "AC-001", type: "test", command: "printf demo", summary: "demo output" }, new AbortController().signal, undefined, { cwd: root });
    assert.match((evidence.details as { evidence: string }).evidence, /^EV-/);
    const finished = await finish.execute("3", {}, new AbortController().signal, undefined, { cwd: root });
    const details = finished.details as { reportPaths: { jsonPath: string; markdownPath: string }; gate: { verdict: string } };
    assert.equal(details.gate.verdict, "NOT VERIFIED");
    assert.match(await readFile(details.reportPaths.jsonPath, "utf8"), /schemaVersion/);
    assert.match(await readFile(details.reportPaths.markdownPath, "utf8"), /Verification Report/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
