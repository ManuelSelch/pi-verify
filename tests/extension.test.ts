import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import registerVerify from "../src/extension.js";

test("only inspector is registered, without verification commands or tools", () => {
  const commands: string[] = [];
  const tools: string[] = [];
  const pi = {
    registerTool(tool: unknown) { tools.push(String(tool)); }, on() {}, sendMessage() {}, sendUserMessage() {},
    registerCommand(name: string) { commands.push(name); },
    async exec() { return { stdout: '', stderr: '', code: 0, killed: false }; },
  } satisfies ExtensionAPI;
  registerVerify(pi);
  assert.deepEqual(commands, ['inspector']);
  assert.deepEqual(tools, []);
});

test("inspector command runs the bundled CLI without options in the session directory", async () => {
  let handler: ((argument: string, ctx: ExtensionCommandContext) => void | Promise<void>) | undefined;
  const calls: unknown[] = [];
  const notifications: Array<{ message: string; type?: string }> = [];
  const pi = {
    registerTool() {}, on() {}, sendMessage() {}, sendUserMessage() {},
    registerCommand(name, options) { if (name === "inspector") handler = options.handler; },
    async exec(command, args, options) { calls.push({ command, args, options }); return { stdout: 'Inspector report: /project/inspector-report.html', stderr: '', code: 0, killed: false }; },
  } satisfies ExtensionAPI;
  registerVerify(pi);
  assert.ok(handler);
  await handler('', { cwd: '/project', ui: { notify: (message, type) => notifications.push({ message, type }) } });
  assert.deepEqual(calls, [{ command: process.execPath, args: [fileURLToPath(new URL('../src/inspector/cli.js', import.meta.url))], options: { cwd: '/project' } }]);
  assert.match(notifications[0].message, /inspector-report.html/);
});

test("inspector command reports failures and rejects arguments", async () => {
  let handler: ((argument: string, ctx: ExtensionCommandContext) => void | Promise<void>) | undefined;
  let calls = 0;
  const notifications: Array<{ message: string; type?: string }> = [];
  const pi = {
    registerTool() {}, on() {}, sendMessage() {}, sendUserMessage() {},
    registerCommand(name, options) { if (name === 'inspector') handler = options.handler; },
    async exec() { calls++; return { stdout: '', stderr: 'Invalid JUnit', code: 1, killed: false }; },
  } satisfies ExtensionAPI;
  registerVerify(pi);
  assert.ok(handler);
  const ctx = { cwd: '/project', ui: { notify: (message: string, type?: 'info' | 'warning' | 'error') => notifications.push({ message, type }) } };
  await handler('unexpected', ctx);
  assert.equal(calls, 0);
  await handler('', ctx);
  assert.equal(calls, 1);
  assert.match(notifications[1].message, /Invalid JUnit/);
  assert.equal(notifications[1].type, 'error');
});
