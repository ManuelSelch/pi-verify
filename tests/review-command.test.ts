import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const { createUpstreamReview } = await import(pathToFileURL(path.resolve("scripts/review.mjs")).href);

function fixture(t: test.TestContext) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "upstream-review-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const evidence = path.join(cwd, ".pi-verify", "coverage", "report.json");
  mkdirSync(path.dirname(evidence), { recursive: true });
  writeFileSync(evidence, "old evidence");
  const calls: string[][] = [];
  return { cwd, evidence, calls };
}

test("npm review builds and invokes the repository-local upstream coverage workflow", async () => {
  const manifest = JSON.parse(await import("node:fs/promises").then(fs => fs.readFile("package.json", "utf8")));
  assert.equal(manifest.scripts.review, "npm run build && node scripts/review.mjs");
});

for (const exit of [0, 1]) test(`upstream workflow generates an exact coverage-backed report after test exit ${exit}`, t => {
  const f = fixture(t);
  const result = createUpstreamReview({ cwd: f.cwd, run: (_command: string, args: string[]) => {
    f.calls.push(args);
    if (args[0] === "merge-base") return { status: 0, stdout: "upstream-base\n" };
    if (args[1] === "collect-coverage") {
      assert.equal(existsSync(f.evidence), false, "old coverage is removed first");
      writeFileSync(f.evidence, "fresh evidence");
      return { status: exit };
    }
    return { status: 0 };
  } });

  assert.equal(result, exit);
  assert.deepEqual(f.calls[0], ["merge-base", "HEAD", "@{upstream}"]);
  assert.deepEqual(f.calls[1].slice(1), ["collect-coverage", "--base", "upstream-base"]);
  assert.deepEqual(f.calls[2].slice(1), ["review", "--base", "upstream-base", "--coverage-report", f.evidence]);
});

test("missing upstream stops before collecting or generating a report", t => {
  const f = fixture(t);
  assert.throws(() => createUpstreamReview({ cwd: f.cwd, run: () => ({ status: 1 }) }), /configure this branch's upstream/);
});

test("collector failures without fresh evidence never produce a report from stale evidence", t => {
  const f = fixture(t);
  assert.throws(() => createUpstreamReview({ cwd: f.cwd, run: (_command: string, args: string[]) => {
    f.calls.push(args);
    return args[0] === "merge-base" ? { status: 0, stdout: "base" } : { status: 1 };
  } }), /produced no report/);
  assert.equal(f.calls.length, 2);
});

test("report import failure stays nonzero even when measurement passed", t => {
  const f = fixture(t);
  assert.equal(createUpstreamReview({ cwd: f.cwd, run: (_command: string, args: string[]) => {
    if (args[0] === "merge-base") return { status: 0, stdout: "base" };
    if (args[1] === "collect-coverage") { writeFileSync(f.evidence, "fresh"); return { status: 0 }; }
    return { status: 2 };
  } }), 2);
});
