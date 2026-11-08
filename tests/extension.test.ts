import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import registerVerify, { buildVerifyPrompt, emitPendingVerificationReport } from "../src/extension.js";

test("architecture commands use the session working directory instead of the process directory", async (t) => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "verify-session-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd });
  git("init", "-q");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  mkdirSync(path.join(cwd, ".pi"));
  mkdirSync(path.join(cwd, "src", "domain"), { recursive: true });
  writeFileSync(path.join(cwd, ".pi", "pi-verify.json"), JSON.stringify({ architecture: { diagram: "docs/architecture.drawio", root: "src" } }));
  writeFileSync(path.join(cwd, "src", "domain", "model.ts"), "export const value = 1;");
  git("add", ".");
  git("commit", "-qm", "initial");

  let handler: ((argument: string, ctx: ExtensionCommandContext) => void | Promise<void>) | undefined;
  const pi = {
    registerTool() {}, on() {}, sendMessage() {}, sendUserMessage() {},
    registerCommand(_name, options) { handler = options.handler; },
  } satisfies ExtensionAPI;
  registerVerify(pi);
  assert.ok(handler);
  const notifications: Array<{ message: string; type?: string }> = [];
  const ctx = { cwd, ui: { notify: (message: string, type?: "info" | "warning" | "error") => notifications.push({ message, type }) } };

  await handler("open", ctx);
  assert.match(notifications.pop()?.message ?? "", /Architecture diagram not found/);
  await handler("approve", ctx);
  assert.match(notifications.pop()?.message ?? "", /Committed/);
});

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
      htmlPath: "/tmp/report.html",
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
      htmlPath: "/tmp/report.html",
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
