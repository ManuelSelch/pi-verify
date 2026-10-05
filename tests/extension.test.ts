import assert from "node:assert/strict";
import test from "node:test";
import { buildVerifyPrompt } from "../src/extension.js";

test("verify prompt is composable and task-specific", () => {
  const prompt = buildVerifyPrompt("Fix the login redirect");
  assert.match(prompt, /Task focus: Fix the login redirect/);
  assert.match(prompt, /installed agent-audits CLI/);
  assert.match(prompt, /added and modified tests separately/);
  assert.match(prompt, /Do not commit, merge/);
  assert.match(prompt, /pi-verify-report\.json/);
  assert.match(prompt, /tests executed/);
});

test("verify prompt allows the task to be inferred", () => {
  assert.match(buildVerifyPrompt(""), /Infer the task focus/);
});
