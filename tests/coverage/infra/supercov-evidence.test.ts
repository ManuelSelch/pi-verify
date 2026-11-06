import assert from "node:assert/strict";
import test from "node:test";
import { collectLineEvidence, collectTestEvidence, type Envelope } from "../../../src/coverage/infra/supercov-evidence.js";

const envelope = (data: Record<string, unknown>, nextOffset: number | null = null): Envelope => ({ schemaVersion: 1, ok: true, data, pagination: { hasMore: nextOffset !== null, nextOffset } });
const evidence = (id: string, line = 1) => ({ id, name: id, file: "tests/a.ts", outcome: "passed", role: "test", attribution: "exact", lines: [{ file: "src/a.ts", line }], totals: { lines: 1 } });

test("test evidence queries overlap with a four-query bound and retain inventory order", async () => {
  let active = 0, peak = 0;
  const result = await collectTestEvidence("run_1", async args => {
    if (args[3] === "") return envelope({ tests: Array.from({ length: 9 }, (_, i) => ({ id: String(i) })) });
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return envelope({ tests: [evidence(args[3])] });
  });

  assert.equal(peak, 4);
  assert.deepEqual(result.map(item => item.id), Array.from({ length: 9 }, (_, i) => String(i)));
});

test("inventory and individual-test pagination retain all executed lines", async () => {
  const result = await collectTestEvidence("run_1", async args => {
    const offset = Number(args.at(-2));
    if (args[3] === "") return offset === 0 ? envelope({ tests: [{ id: "a" }] }, 1) : envelope({ tests: [{ id: "b" }] });
    return envelope({ tests: [{ ...evidence(args[3], offset + 1), totals: { lines: 2 } }] }, offset === 0 ? 1 : null);
  });

  assert.deepEqual(result.map(item => item.lines.map(line => line.line)), [[1, 2], [1, 2]]);
});

test("bulk lines follow pagination, normalize non-executable lines and retain missing-source uncertainty", async () => {
  const calls: string[][] = [];
  const locations = ["src/a.ts:1", "src/a.ts:2", "src/missing.ts:1"];
  const result = await collectLineEvidence("run_1", locations, async args => {
    calls.push(args);
    return calls.length === 1
      ? envelope({ lines: [{ location: { file: "src/a.ts", line: 1 }, totalAnchored: 1, covered: true, tests: [{ id: "a" }], totalTests: 5, limitations: [] }], failed: [{ location: "src/missing.ts:1", code: "SOURCE_NOT_FOUND" }] }, 1)
      : envelope({ lines: [{ location: { file: "src/a.ts", line: 2 }, lineObligation: false, totalAnchored: 0, coveredAnchored: 0, tests: [], limitations: [] }], failed: [{ location: "src/missing.ts:1", code: "SOURCE_NOT_FOUND" }] });
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].slice(3, 6), locations);
  assert.equal(result["src/a.ts:1"].covered, true);
  assert.equal(result["src/a.ts:2"].covered, false);
  assert.equal(result["src/missing.ts:1"].limitations.length, 1);
});

test("bulk lines reject missing results, unexpected failures and stalled pagination", async () => {
  await assert.rejects(collectLineEvidence("run_1", ["src/a.ts:1"], async () => envelope({ lines: [] })), /Incomplete/);
  await assert.rejects(collectLineEvidence("run_1", ["src/a.ts:1"], async () => envelope({ lines: [], failed: [{ location: "src/a.ts:1", code: "AMBIGUOUS_SOURCE" }] })), /AMBIGUOUS_SOURCE/);
  await assert.rejects(collectLineEvidence("run_1", ["src/a.ts:1"], async () => envelope({ lines: [] }, 0)), /pagination/);
});

test("empty scopes do not launch evidence queries", async () => {
  const unexpected = async (): Promise<Envelope> => { throw new Error("unexpected query"); };
  assert.deepEqual(await collectLineEvidence("run_1", [], unexpected), {});
  assert.deepEqual(await collectTestEvidence("run_1", async () => envelope({ tests: [] })), []);
});

test("line batches bound argument size and accept a singleton response", async () => {
  let calls = 0;
  const locations = Array.from({ length: 101 }, (_, i) => `src/a.ts:${i + 1}`);
  const result = await collectLineEvidence("run_1", locations, async args => {
    calls++;
    const batch = args.slice(3, args.indexOf("--limit"));
    assert.ok(batch.length <= 100);
    const lines = batch.map(location => ({ location: { file: "src/a.ts", line: Number(location.split(":")[1]) }, totalAnchored: 1, covered: false, tests: [], limitations: [] }));
    return envelope(batch.length === 1 ? lines[0] : { lines });
  });

  assert.equal(calls, 2);
  assert.equal(Object.keys(result).length, 101);
});

test("entirely unanswered batches inspect each failure instead of masking other errors", async () => {
  const missing = Object.assign(new Error("missing"), { stdout: JSON.stringify({ ok: false, error: { code: "SOURCE_NOT_FOUND" } }) });
  const result = await collectLineEvidence("run_1", ["missing.ts:1", "missing.ts:2"], async () => { throw missing; });
  assert.equal(Object.keys(result).length, 2);
  assert.ok(Object.values(result).every(line => line.limitations.length === 1));

  await assert.rejects(collectLineEvidence("run_1", ["missing.ts:1", "ambiguous.ts:1"], async args => {
    if (args[3] === "ambiguous.ts:1") throw new Error("ambiguous");
    throw missing;
  }), /ambiguous/);
});

test("failed test queries settle active workers and do not schedule remaining tests", async () => {
  let active = 0, started = 0;
  await assert.rejects(collectTestEvidence("run_1", async args => {
    if (args[3] === "") return envelope({ tests: Array.from({ length: 10 }, (_, i) => ({ id: String(i) })) });
    started++; active++;
    await new Promise(resolve => setImmediate(resolve));
    active--;
    if (args[3] === "0") throw new Error("failed worker");
    return envelope({ tests: [evidence(args[3])] });
  }), /failed worker/);

  assert.equal(active, 0);
  assert.equal(started, 4);
});

test("test evidence rejects truncation and failed queries", async () => {
  await assert.rejects(collectTestEvidence("run_1", async args => envelope({ tests: args[3] === "" ? [{ id: "a" }] : [{ ...evidence("a"), totals: { lines: 2 } }] })), /truncated/);
  await assert.rejects(collectTestEvidence("run_1", async () => { throw new Error("query failed"); }), /query failed/);
});
