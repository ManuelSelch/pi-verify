import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { collectGitSnapshots } from "../../../src/coverage/infra/git-snapshots.js";

class SnapshotProject {
  private readonly root = mkdtempSync(path.join(os.tmpdir(), "coverage-snapshots-"));
  private readonly sources: Record<string, string> = {};
  private readonly commands: string[][] = [];
  private readonly cwd: string;
  private base = "";

  constructor(t: TestContext, project = "") {
    t.after(() => rmSync(this.root, { recursive: true, force: true }));
    this.cwd = path.join(this.root, project);
    mkdirSync(this.cwd, { recursive: true });
    this.git("init"); this.git("config", "user.email", "test@example.com"); this.git("config", "user.name", "Test");
  }
  private git(...args: string[]): string { return execFileSync("git", args, { cwd: this.root, encoding: "utf8", stdio: "pipe" }).trim(); }
  source(file: string, text: string): void {
    mkdirSync(path.dirname(path.join(this.cwd, file)), { recursive: true });
    writeFileSync(path.join(this.cwd, file), text);
    this.sources[file] = text;
  }
  exclude(file: string): void { delete this.sources[file]; }
  commitBase(): void { this.git("add", "."); this.git("commit", "-m", "base"); this.base = this.git("rev-parse", "HEAD"); }
  stage(): void { this.git("add", "."); }
  commitChanges(): void { this.stage(); this.git("commit", "-m", "change"); }
  rename(from: string, to: string): void {
    renameSync(path.join(this.cwd, from), path.join(this.cwd, to));
    this.sources[to] = this.sources[from]; delete this.sources[from];
  }
  async collect() {
    return collectGitSnapshots(this.cwd, this.base, this.sources, (args, input) => {
      this.commands.push(args);
      return new Promise<Buffer>((resolve, reject) => {
        const child = execFile("git", args, { cwd: this.cwd, encoding: "buffer", timeout: 10000, maxBuffer: 20 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout));
        child.stdin!.on("error", () => { /* Process errors are reported by execFile. */ });
        child.stdin!.end(input);
      });
    });
  }
  assertBatched(): void {
    assert.equal(this.commands.length, 3, "tree lookup, blob contents and diff each run once");
    assert.equal(this.commands.filter(args => args[0] === "cat-file").length, 1);
  }
}

test("empty scopes run no Git commands and entirely new scopes need no blob reads", async () => {
  const unexpected = async (): Promise<Buffer> => { throw new Error("unexpected Git command"); };
  assert.deepEqual(await collectGitSnapshots(".", "base", {}, unexpected), { before: {}, changed: {} });
  let calls = 0;
  const result = await collectGitSnapshots(".", "base", { "src/new.ts": "new\nfile" }, async () => { calls++; return Buffer.alloc(0); });
  assert.deepEqual(result, { before: { "src/new.ts": "" }, changed: { "src/new.ts": [1, 2] } });
  assert.equal(calls, 2);
});

test("malformed or truncated Git blob frames and diff records fail collection", async () => {
  const tree = Buffer.from("100644 blob abc\tsrc/a.ts\0");
  for (const invalid of ["", "wrong blob 0\n\n", "abc blob 5\nshort", "abc blob 0\n\nextra"]) {
    await assert.rejects(collectGitSnapshots(".", "base", { "src/a.ts": "" }, async args => args.includes("ls-tree") ? tree : Buffer.from(invalid)), /Git blob/);
  }
  await assert.rejects(collectGitSnapshots(".", "base", { "src/a.ts": "" }, async args => {
    if (args.includes("ls-tree")) return tree;
    if (args.includes("cat-file")) return Buffer.from("abc blob 0\n\n");
    return Buffer.from(":100644 100644 abc def M\0src/a.ts\0\0");
  }), /records and patches disagree/);
});

test("snapshots batch Git operations across files while retaining working-tree changes", async t => {
  const project = new SnapshotProject(t);
  project.source("src/changed.ts", "one\ntwo\nthree\n");
  project.source("src/unchanged.ts", "unchanged\n");
  project.source("src/empty.ts", "");
  project.commitBase();
  project.source("src/changed.ts", "one\ncommitted\nthree\n");
  project.commitChanges();
  project.source("src/changed.ts", "one\nstaged\nthree\n");
  project.stage();
  project.source("src/changed.ts", "one\nworking\nthree\nfour\n");
  project.source("src/new.ts", "new\nfile\n");
  project.source("src/new-empty.ts", "");

  const result = await project.collect();

  assert.equal(result.before["src/changed.ts"], "one\ntwo\nthree\n");
  assert.deepEqual(result.changed["src/changed.ts"], [2, 4]);
  assert.deepEqual(result.changed["src/unchanged.ts"], []);
  assert.equal(result.before["src/empty.ts"], "");
  assert.deepEqual(result.changed["src/new.ts"], [1, 2]);
  assert.equal(result.before["src/new.ts"], "");
  assert.deepEqual(result.changed["src/new-empty.ts"], []);
  project.assertBatched();
});

test("monorepo snapshots preserve literal unusual paths and byte-framed UTF-8 blobs", async t => {
  const project = new SnapshotProject(t, "frontend");
  for (const file of ["src/a[1].ts", "src/sp ace.ts", 'src/quote".ts', "src/tab\tline\nü.ts"])
    project.source(file, "Grüße\n😀\n");
  project.source("src/a1.ts", "not selected\n");
  project.exclude("src/a1.ts");
  project.commitBase();
  project.source("src/a1.ts", "unrelated change\n");
  project.exclude("src/a1.ts");
  for (const file of ["src/a[1].ts", "src/sp ace.ts", 'src/quote".ts', "src/tab\tline\nü.ts"])
    project.source(file, "Grüße\nchanged\n");

  const result = await project.collect();

  for (const file of Object.keys(result.before)) {
    assert.equal(result.before[file], "Grüße\n😀\n");
    assert.deepEqual(result.changed[file], [2]);
  }
  assert.equal(Object.keys(result.before).length, 4);
  project.assertBatched();
});

test("renamed files remain new relative to the base and deletion-only edits add no lines", async t => {
  const project = new SnapshotProject(t);
  project.source("src/old.ts", "keep\n");
  project.source("src/deleted-lines.ts", "one\ntwo\nthree\n");
  project.commitBase();
  project.rename("src/old.ts", "src/renamed.ts");
  project.source("src/deleted-lines.ts", "one\nthree\n");
  project.stage();

  const result = await project.collect();

  assert.equal(result.before["src/renamed.ts"], "");
  assert.deepEqual(result.changed["src/renamed.ts"], [1]);
  assert.deepEqual(result.changed["src/deleted-lines.ts"], []);
  project.assertBatched();
});
