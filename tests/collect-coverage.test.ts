import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = process.env.PI_VERIFY_TEST_CLI ?? fileURLToPath(new URL("../src/cli.js", import.meta.url));
const supportsTypescript = Number(process.versions.node.split(".")[0]) >= 23 || (Number(process.versions.node.split(".")[0]) === 22 && Number(process.versions.node.split(".")[1]) >= 18);

test("collects TypeScript coverage and automatically imports it into the review", { skip: !supportsTypescript, timeout: 120000 }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pi-coverage-cli-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString().trim();
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: "utf8", timeout: 100000 });
  try {
    mkdirSync(path.join(dir, "src")); mkdirSync(path.join(dir, "test"));
    writeFileSync(path.join(dir, ".gitignore"), ".pi-verify/\n.supercov/\n");
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module", scripts: { test: "node --experimental-strip-types --test test/*.test.ts" } }));
    writeFileSync(path.join(dir, "src/math.ts"), "export const add = (a: number, b: number) => a + b;\n");
    writeFileSync(path.join(dir, "test/math.test.ts"), 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { add } from "../src/math.ts";\ntest("add", () => assert.equal(add(1, 2), 3));\n');
    git("init"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test"); git("add", "."); git("commit", "-m", "base"); git("checkout", "-b", "feature");
    writeFileSync(path.join(dir, "src/math.ts"), "export const add = (a: number, b: number) => a + b + 0;\n");
    git("commit", "-am", "change");
    const collected = run("collect-coverage");
    assert.equal(collected.status, 0, collected.stderr);
    const coverage = JSON.parse(readFileSync(path.join(dir, ".pi-verify", "coverage", "report.json"), "utf8"));
    assert.equal(coverage.run.exitCode, 0);
    assert.ok(coverage.tests.some((item: { name: string }) => item.name === "add"));
    const reviewed = run("review");
    assert.equal(reviewed.status, 0, reviewed.stderr);
    const report = JSON.parse(readFileSync(path.join(dir, ".pi-verify", "pi-verify-report.json"), "utf8"));
    assert.equal(report.review.sections.testsCoverage.status, "available");
    assert.ok(report.review.coverage.tests.some((item: { name: string }) => item.name === "add"));

    writeFileSync(path.join(dir, "src/math.ts"), "export const add = (a: number, b: number) => a + b + 1;\n");
    git("commit", "-am", "change after measurement");
    const staleReview = run("review");
    assert.notEqual(staleReview.status, 0);
    assert.match(staleReview.stderr, /Coverage target does not match/);

    const failed = run("collect-coverage");
    assert.equal(failed.status, 1, failed.stderr);
    const failedReview = run("review");
    assert.equal(failedReview.status, 0, failedReview.stderr);
    const failedReport = JSON.parse(readFileSync(path.join(dir, ".pi-verify", "pi-verify-report.json"), "utf8"));
    assert.equal(failedReport.review.coverage.run.exitCode, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
