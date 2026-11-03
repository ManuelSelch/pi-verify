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
    mkdirSync(path.join(dir, "src", "nested"), { recursive: true }); mkdirSync(path.join(dir, "tests", "nested"), { recursive: true }); mkdirSync(path.join(dir, "docs"));
    writeFileSync(path.join(dir, ".gitignore"), ".pi-verify/\n.supercov/\n");
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module", scripts: { test: "node --experimental-strip-types --test tests/*.test.ts tests/nested/*.test.ts" } }));
    writeFileSync(path.join(dir, "src/math.ts"), "export const add = (a: number, b: number) => a + b;\n");
    writeFileSync(path.join(dir, "tests/math.test.ts"), 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { add } from "../src/math.ts";\ntest("add", () => assert.equal(add(1, 2), 3));\n');
    writeFileSync(path.join(dir, "src/nested/value.ts"), "export const value: number = 7;\n");
    writeFileSync(path.join(dir, "tests/nested/value.test.ts"), 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { value } from "../../src/nested/value.ts";\ntest("value", () => assert.equal(value, 7));\n');
    git("init"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test"); git("add", "."); git("commit", "-m", "base"); git("checkout", "-b", "feature");
    writeFileSync(path.join(dir, "src/math.ts"), "export const add = (a: number, b: number) => a + b + 0;\n");
    writeFileSync(path.join(dir, "src/new.ts"), "export const answer: number = 42;\n");
    writeFileSync(path.join(dir, "tests/new.test.ts"), 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { answer } from "../src/new.ts";\ntest("answer", () => assert.equal(answer, 42));\n');
    git("add", "."); git("commit", "-m", "change");
    const fileOption = run("collect-coverage", "--source", "src/math.ts", "--test", "tests");
    assert.notEqual(fileOption.status, 0);
    assert.match(fileOption.stderr, /Not a directory/);
    const collected = run("collect-coverage", "--source", "src", "--test", "tests");
    assert.equal(collected.status, 0, collected.stderr);
    const coverage = JSON.parse(readFileSync(path.join(dir, ".pi-verify", "coverage", "report.json"), "utf8"));
    assert.equal(coverage.run.exitCode, 0);
    assert.ok(coverage.tests.some((item: { name: string }) => item.name === "add"));
    assert.ok(coverage.tests.some((item: { name: string }) => item.name === "value"));
    assert.ok(coverage.sources["src/nested/value.ts"]);
    const reviewed = run("review");
    assert.equal(reviewed.status, 0, reviewed.stderr);
    const report = JSON.parse(readFileSync(path.join(dir, ".pi-verify", "pi-verify-report.json"), "utf8"));
    assert.equal(report.review.sections.testsCoverage.status, "available");
    assert.ok(report.review.coverage.tests.some((item: { name: string }) => item.name === "add"));

    // A later commit that leaves measured sources, tests and configuration unchanged keeps the evidence.
    writeFileSync(path.join(dir, "docs", "note.md"), "Documentation only.\n");
    git("add", "docs/note.md"); git("commit", "-m", "docs only");
    const keptReview = run("review");
    assert.equal(keptReview.status, 0, keptReview.stderr);
    const keptReport = JSON.parse(readFileSync(path.join(dir, ".pi-verify", "pi-verify-report.json"), "utf8"));
    assert.equal(keptReport.review.sections.testsCoverage.status, "available");

    // A measured source change invalidates the evidence without blocking a new review.
    writeFileSync(path.join(dir, "src/math.ts"), "export const add = (a: number, b: number) => a + b + 1;\n");
    git("commit", "-am", "change after measurement");
    const changedReview = run("review");
    assert.equal(changedReview.status, 0, changedReview.stderr);
    assert.match(changedReview.stderr, /Coverage not imported/);
    const changedReport = JSON.parse(readFileSync(path.join(dir, ".pi-verify", "pi-verify-report.json"), "utf8"));
    assert.equal(changedReport.review.sections.testsCoverage.status, "unavailable");

    const failed = run("collect-coverage");
    assert.equal(failed.status, 1, failed.stderr);
    const failedReview = run("review");
    assert.equal(failedReview.status, 0, failedReview.stderr);
    const failedReport = JSON.parse(readFileSync(path.join(dir, ".pi-verify", "pi-verify-report.json"), "utf8"));
    assert.equal(failedReport.review.coverage.run.exitCode, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
