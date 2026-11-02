import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
type Snapshot = {
  name: string;
  counts: Record<string, number>;
  files: Record<string, number[]>;
  ranges: Record<string, Array<{ functionName: string; ranges: Array<{ startOffset: number; endOffset: number; count: number }> }>>;
};

async function measure(mode: "serial" | "overlap"): Promise<Snapshot[]> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pi-verify-coverage-spike-"));
  try {
    const output = path.join(directory, "snapshots.json");
    const env: NodeJS.ProcessEnv = { ...process.env, SPIKE_MODE: mode, SPIKE_OUTPUT: output };
    delete env.NODE_TEST_CONTEXT;
    await exec(process.execPath, ["--test", "tests/fixtures/coverage-spike/hooked-suite.cjs"], {
      cwd: process.cwd(),
      env,
      timeout: 15000,
    });
    return JSON.parse(await readFile(output, "utf8")) as Snapshot[];
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("coverage hooks attribute separate serial tests within a single suite run", async () => {
  const snapshots = await measure("serial");

  assert.equal(snapshots.length, 2);
  const alpha = snapshots.find((entry) => entry.name === "alpha test")!;
  const beta = snapshots.find((entry) => entry.name === "beta test")!;
  assert.equal(alpha.counts.alpha, 1);
  assert.equal(alpha.counts.beta ?? 0, 0);
  assert.equal(beta.counts.alpha ?? 0, 0);
  assert.equal(beta.counts.beta, 1);
  assert.deepEqual(alpha.files["tests/fixtures/coverage-spike/subject.cjs"], [1, 2, 3]);
  assert.deepEqual(beta.files["tests/fixtures/coverage-spike/subject.cjs"], [5, 6, 7]);
  assert.ok(alpha.ranges["tests/fixtures/coverage-spike/subject.cjs"].some((fn) => fn.functionName === "alpha" && fn.ranges[0].count === 1));
});

test("real TypeScript source maps and parallel test-file snapshots expose attribution limits", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pi-verify-coverage-real-"));
  try {
    const output = path.join(directory, "snapshots.jsonl");
    const env: NodeJS.ProcessEnv = { ...process.env, SPIKE_TARGET: path.resolve("dist/src/report.js"), SPIKE_OUTPUT: output, SPIKE_BARRIER: directory };
    delete env.NODE_TEST_CONTEXT;
    const args = ["--enable-source-maps", "--require", "./tests/fixtures/coverage-spike/preload.cjs", "--test", "--test-concurrency=2", "tests/fixtures/coverage-spike/real-report-one.cjs", "tests/fixtures/coverage-spike/real-report-two.cjs"];

    await exec(process.execPath, args, { env, timeout: 15000 });
    const rows = (await readFile(output, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { name: string; pid: number; files: Record<string, number[]>; sourceMapFound: boolean });
    const source = path.resolve("src/report.ts");
    const text = await readFile(source, "utf8");
    const changedLine = text.split("\n").findIndex((line) => line.includes("JSON.stringify({ schemaVersion: 1")) + 1;
    assert.ok(changedLine > 0);
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map((row) => row.pid)).size, 2, "parallel files have separate coverage counters");
    assert.ok(rows.every((row) => row.sourceMapFound && row.files[source].includes(changedLine)));
    assert.ok(rows.every((row) => row.name === "duplicate"), "names alone do not identify nested tests");
    assert.ok(rows.some((row, index) => rows.some((other, j) => index !== j && row.pid === other.pid && row.name === other.name)), "duplicate names also collide within one file");

    // A real Git comparison, with an earlier version of the same source line.
    const git = (...args: string[]) => exec("git", args, { cwd: directory });
    await git("init", "-b", "main");
    await git("config", "user.email", "test@example.com");
    await git("config", "user.name", "Test");
    await mkdir(path.join(directory, "src"));
    await writeFile(path.join(directory, "src/report.ts"), text.replace("schemaVersion: 1, ...report", "schemaVersion: 0, ...report"));
    await git("add", "src/report.ts");
    await git("commit", "-m", "base");
    await writeFile(path.join(directory, "src/report.ts"), text);
    await git("add", "src/report.ts");
    await git("commit", "-m", "target");
    const diff = (await git("diff", "--unified=0", "HEAD^", "HEAD", "--", "src/report.ts")).stdout;
    const hunk = diff.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/m);
    assert.ok(hunk);
    assert.equal(Number(hunk[1]), changedLine);
    assert.equal(rows.filter((row) => row.files[source].includes(Number(hunk[1]))).length, 3);
    // One hit comes from a beforeEach hook, not the markdown test body.
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("failing test still triggers the coverage hook but the snapshot has no outcome", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pi-verify-coverage-failure-"));
  try {
    const output = path.join(directory, "failure.jsonl");
    const env: NodeJS.ProcessEnv = { ...process.env, SPIKE_TARGET: path.resolve("dist/src/report.js"), SPIKE_OUTPUT: output };
    delete env.NODE_TEST_CONTEXT;
    await assert.rejects(exec(process.execPath, ["--enable-source-maps", "--require", "./tests/fixtures/coverage-spike/preload.cjs", "--test", "tests/fixtures/coverage-spike/real-report-failure.cjs"], { env, timeout: 15000 }), (error: { code?: number }) => error.code === 1);
    const row = JSON.parse((await readFile(output, "utf8")).trim()) as { name: string; files: Record<string, number[]>; status?: string };
    assert.equal(row.name, "failing example");
    assert.ok(row.files[path.resolve("src/report.ts")].length > 0);
    assert.equal(row.status, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("overlapping tests contaminate shared coverage snapshots", async () => {
  const snapshots = await measure("overlap");

  assert.equal(snapshots.length, 2);
  const alpha = snapshots.find((entry) => entry.name === "alpha test")!;
  const beta = snapshots.find((entry) => entry.name === "beta test")!;
  assert.equal(alpha.counts.alpha, 1);
  assert.equal(alpha.counts.beta, 1, "beta's hit is incorrectly attributed to alpha");
  assert.equal(beta.counts.beta ?? 0, 0, "beta's own hit was consumed by alpha's snapshot");
  assert.deepEqual(alpha.files["tests/fixtures/coverage-spike/subject.cjs"], [1, 2, 3, 5, 6, 7]);
  assert.deepEqual(beta.files["tests/fixtures/coverage-spike/subject.cjs"], []);
});
