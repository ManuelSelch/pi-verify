import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { collectGitScope } from "../src/git-scope.js";
import { collectReviewReport } from "../src/review-report/infra/collect.js";

class ComparisonDriver {
  readonly root = mkdtempSync(path.join(os.tmpdir(), "pi-verify-upstream-"));
  readonly cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
  readonly published: string;

  constructor() {
    this.git("init", "-b", "main");
    this.git("config", "user.email", "test@example.com");
    this.git("config", "user.name", "Test");
    this.commit("published");
    this.published = this.git("rev-parse", "HEAD");
    this.git("remote", "add", "origin", "https://example.invalid/repo.git");
    this.git("update-ref", "refs/remotes/origin/main", this.published);
    this.git("branch", "--set-upstream-to", "origin/main");
  }

  private git(...args: string[]) {
    return execFileSync("git", args, { cwd: this.root, stdio: "pipe" }).toString().trim();
  }

  commit(subject: string) { this.git("commit", "--allow-empty", "-m", subject); }
  startFeature() {
    this.git("checkout", "-b", "feature");
    this.git("branch", "--set-upstream-to", "origin/main");
  }
  publishCurrent() { this.git("update-ref", "refs/remotes/origin/main", this.git("rev-parse", "HEAD")); }
  divergeUpstream() {
    this.git("checkout", "--detach", this.published);
    this.commit("remote-only");
    this.git("update-ref", "refs/remotes/origin/main", this.git("rev-parse", "HEAD"));
    this.git("checkout", "main");
  }
  expireReflog() { this.git("reflog", "expire", "--expire=all", "--all"); }

  async assertComparison(method: string, subjects: string[]) {
    const scope = await collectGitScope(this.root);
    assert.equal(scope.baseline, this.published);
    assert.equal(scope.baselineMethod, method);
    assert.deepEqual(scope.commits.map(commit => commit.subject), subjects);

    const result = spawnSync(process.execPath, [this.cli, "review"], { cwd: this.root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(path.join(this.root, ".pi-verify/pi-verify-report.json"), "utf8"));
    assert.equal(report.review.comparison.base, this.published);
    assert.equal(report.review.comparison.method, method);

    const collected = await collectReviewReport(scope, []);
    assert.equal(collected.comparison.base, this.published);
    assert.equal(collected.comparison.method, method);
  }

  assertCoverageUsesComparison() {
    // No source directories exist: reaching directory validation proves base selection succeeded.
    const result = spawnSync(process.execPath, [this.cli, "collect-coverage"], { cwd: this.root, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Directory not found: src/);
  }
  close() { rmSync(this.root, { recursive: true, force: true }); }
}

for (const state of ["ahead", "diverged", "synced", "expired reflog"] as const) {
  test(`compares local commits against upstream when ${state}`, async () => {
    const app = new ComparisonDriver();
    try {
      if (state !== "synced") app.commit("local-only");
      if (state === "diverged") app.divergeUpstream();
      if (state === "expired reflog") app.expireReflog();

      await app.assertComparison("upstream-merge-base", state === "synced" ? [] : ["local-only"]);
      const [major, minor] = process.versions.node.split(".").map(Number);
      if (major > 22 || (major === 22 && minor >= 18)) app.assertCoverageUsesComparison();
    } finally { app.close(); }
  });
}

test("preserves feature creation base even when it inherits an upstream", async () => {
  const app = new ComparisonDriver();
  try {
    app.startFeature();
    app.commit("feature-only");
    app.publishCurrent();

    await app.assertComparison("branch-creation-reflog", ["feature-only"]);
  } finally { app.close(); }
});
