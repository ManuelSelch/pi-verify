import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

test("review creates a report for a feature branch and records excluded changes", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pi-verify-cli-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString().trim();
  try {
    git("init"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
    writeFileSync(path.join(dir, "file.txt"), "base"); git("add", "."); git("commit", "-m", "base");
    git("checkout", "-b", "feature");
    writeFileSync(path.join(dir, "file.txt"), "target"); git("commit", "-am", "target");
    writeFileSync(path.join(dir, "file.txt"), "uncommitted");
    const result = spawnSync(process.execPath, [cli, "review"], { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(path.join(dir, ".pi-verify", "pi-verify-report.json"), "utf8"));
    assert.equal(report.review.comparison.status, "available");
    assert.deepEqual(report.review.comparison.excludedWorkingTree.unstaged, ["file.txt"]);
    assert.equal(report.review.sections.architecture.status, "unavailable");
    assert.deepEqual(report.review.sections.testsCoverage.limitations, ["No coverage report supplied."]);
    assert.deepEqual(report.review.sections.architecture.limitations, ["No supported architecture diagram found."]);
    const html = readFileSync(path.join(dir, ".pi-verify", "pi-verify-report.html"), "utf8");
    assert.match(html, /No coverage report supplied\./);
    assert.match(html, /No supported architecture diagram found\./);
    assert.match(result.stdout, /\.pi-verify\/.*html/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("review requires an explicit base when branch creation is unavailable", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pi-verify-cli-"));
  try {
    execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "--allow-empty", "-m", "initial"], { cwd: dir, stdio: "pipe" });
    const result = spawnSync(process.execPath, [cli, "review"], { cwd: dir, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--base/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("preview explains when no report exists", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pi-verify-cli-"));
  try {
    const result = spawnSync(process.execPath, [cli, "preview"], { cwd: dir, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /review/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
