import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { collectGitScope } from "../src/git-scope.js";

const exec = promisify(execFile);
async function git(cwd: string, ...args: string[]) {
  return (await exec("git", args, { cwd })).stdout.trim();
}

test("collects a worktree creation baseline and every later commit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-verify-git-"));
  const worktree = `${root}-worktree`;
  try {
    await git(root, "init", "-b", "main");
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await writeFile(path.join(root, "base.txt"), "base\n");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "base");
    const baseline = await git(root, "rev-parse", "HEAD");
    await git(root, "worktree", "add", "-b", "feature/demo", worktree);
    await writeFile(path.join(worktree, "one.txt"), "one\n");
    await git(worktree, "add", ".");
    await git(worktree, "commit", "-m", "first task commit");
    await writeFile(path.join(worktree, "two.txt"), "two\n");
    await git(worktree, "add", ".");
    await git(worktree, "commit", "-m", "second task commit");

    const scope = await collectGitScope(worktree);
    assert.equal(scope.baseline, baseline);
    assert.equal(scope.baselineMethod, "branch-creation-reflog");
    assert.deepEqual(scope.commits.map((commit) => commit.subject), ["first task commit", "second task commit"]);
    assert.equal(scope.clean, true);
    assert.deepEqual(scope.untracked, []);
    assert.match(scope.fingerprint, /^[a-f0-9]{64}$/);

    await writeFile(path.join(worktree, "untracked.txt"), "not committed\n");
    const dirty = await collectGitScope(worktree);
    assert.equal(dirty.clean, false);
    assert.deepEqual(dirty.untracked, ["untracked.txt"]);
  } finally {
    await exec("git", ["worktree", "remove", "--force", worktree], { cwd: root }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
    await rm(worktree, { recursive: true, force: true });
  }
});

test("uses the empty tree before an initial commit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-verify-root-"));
  try {
    await git(root, "init", "-b", "main");
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await writeFile(path.join(root, "only.txt"), "only\n");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "initial task");
    const scope = await collectGitScope(root);
    assert.equal(scope.baselineMethod, "empty-tree");
    assert.deepEqual(scope.commits.map((commit) => commit.subject), ["initial task"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
