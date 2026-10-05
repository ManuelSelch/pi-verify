import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AgentAuditsRun } from "../src/agent-audits.js";

test("Agent Audits workspace is separate from source and preserves a failed gate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-verify-"));
  try {
    const source = path.join(root, "source");
    const run = path.join(root, "run");
    await mkdir(source);
    await writeFile(path.join(source, "test_app.py"), "def test_ok():\n    assert True\n");
    const audit = new AgentAuditsRun(source, run);
    await audit.init();
    await audit.plan("Verify demo tests");
    const evidence = await audit.addCommandEvidence("AC-001", "test", "python3 -m unittest discover -s .", { expectedExitCode: 0 });
    assert.equal(evidence, "EV-001");
    const gate = await audit.check();
    assert.equal(gate.verdict, "NOT VERIFIED");
    assert.equal(gate.allowed, false);
    await readFile(path.join(run, ".agent-audits", "evidence", "EV-001.log"));
    await assert.rejects(readFile(path.join(source, ".agent-audits")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
