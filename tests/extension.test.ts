import assert from "node:assert/strict";
import test from "node:test";
import { buildVerifyPrompt, emitPendingVerificationReport } from "../src/extension.js";

test("verify prompt is composable and task-specific", () => {
  const prompt = buildVerifyPrompt("Fix the login redirect");
  assert.match(prompt, /Task focus: Fix the login redirect/);
  assert.match(prompt, /verify_start, verify_add_evidence, verify_review, and verify_finish/);
  assert.match(prompt, /added and modified tests separately/);
  assert.match(prompt, /Do not commit, merge/);
  assert.match(prompt, /pi-verify-report\.json/);
  assert.match(prompt, /tests executed/);
  assert.match(prompt, /Do not manually write or overwrite/);
  assert.match(prompt, /required evidence types/);
  assert.match(prompt, /automatically checks the source state/);
  assert.doesNotMatch(prompt, /branch|baseline|HEAD|fingerprint/i);
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
  assert.match(buildVerifyPrompt(""), /Infer the task focus/);
});
