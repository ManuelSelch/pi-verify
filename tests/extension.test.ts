import assert from "node:assert/strict";
import test from "node:test";
import { buildVerifyPrompt, emitPendingVerificationReport } from "../src/extension.js";

test("verify prompt is composable and task-specific", () => {
  const prompt = buildVerifyPrompt("Fix the login redirect");
  assert.match(prompt, /Task focus: Fix the login redirect/);
  assert.match(prompt, /ordinary execution and browser tools/);
  assert.match(prompt, /verify_attach/);
  assert.match(prompt, /verify_finish/);
  assert.match(prompt, /added and modified tests from tests executed/i);
  assert.match(prompt, /Do not commit, merge/);
  assert.match(prompt, /committed task changes/);
  assert.match(prompt, /baseline uncertainty/);
  assert.match(prompt, /Do not manually write or overwrite/);
  assert.doesNotMatch(prompt, /verify_start|verify_add_evidence|verify_review/i);
});

test("emits a completed report once without triggering another turn", () => {
  const state = {
    pendingReport: {
      markdown: "# Verification Report",
      jsonPath: "/tmp/report.json",
      markdownPath: "/tmp/report.md",
      auditDir: "/tmp/audit",
      verdict: "VERIFIED",
      allowed: true,
    },
  };
  const messages: Array<{ message: unknown; options: unknown }> = [];
  const sendMessage = (message: unknown, options: unknown) => messages.push({ message, options });
  assert.equal(emitPendingVerificationReport(state, sendMessage), true);
  assert.equal(emitPendingVerificationReport(state, sendMessage), false);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].options, { triggerTurn: false });
  assert.deepEqual(messages[0].message, {
    customType: "pi-verify-report",
    content: "# Verification Report",
    display: true,
    details: {
      verdict: "VERIFIED",
      allowed: true,
      auditDir: "/tmp/audit",
      jsonPath: "/tmp/report.json",
      markdownPath: "/tmp/report.md",
    },
  });
});

test("does not emit a report before verify_finish", () => {
  const messages: unknown[] = [];
  assert.equal(emitPendingVerificationReport({}, (message) => messages.push(message)), false);
  assert.equal(messages.length, 0);
});

test("verify prompt allows the task to be inferred", () => {
  assert.match(buildVerifyPrompt("   "), /Infer the task focus/);
});

test("verify prompt handles docs-only checks and honest failures", () => {
  const prompt = buildVerifyPrompt("Update docs");
  assert.match(prompt, /docs-only tasks/);
  assert.match(prompt, /inspect the real output/i);
  assert.match(prompt, /failed, skipped, cancelled, timed-out, or unknown/i);
  assert.match(prompt, /baseline uncertainty/i);
  assert.match(prompt, /logs and traces may contain secrets/i);
  assert.match(prompt, /was the task actually validated/i);
});
