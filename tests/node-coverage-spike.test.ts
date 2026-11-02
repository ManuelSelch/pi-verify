import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
