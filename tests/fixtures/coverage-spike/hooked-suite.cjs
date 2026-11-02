const { test, describe, before, beforeEach, afterEach, after } = require("node:test");
const { Session } = require("node:inspector");
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { alpha, beta } = require("./subject.cjs");

const session = new Session();
session.connect();
const post = (method, params = {}) => new Promise((resolve, reject) => {
  session.post(method, params, (error, result) => error ? reject(error) : resolve(result));
});
const entries = [];
const subjectPath = require.resolve("./subject.cjs");
const target = pathToFileURL(subjectPath).href;
const subject = readFileSync(subjectPath, "utf8");
const relativeSubject = path.relative(process.cwd(), subjectPath).split(path.sep).join("/");

// V8 offsets are UTF-16 offsets in the generated source. Ignore the module wrapper:
// it ran before the first snapshot and would falsely mark every function as covered.
function coveredLines(functions) {
  const lines = new Set();
  for (const fn of functions) {
    if (!fn.functionName || !["alpha", "beta"].includes(fn.functionName)) continue;
    const [root, ...blocks] = fn.ranges;
    for (let i = root.startOffset; i < root.endOffset; i++) {
      if (/\s/.test(subject[i])) continue;
      let count = root.count;
      for (const block of blocks) if (i >= block.startOffset && i < block.endOffset) count = block.count;
      if (count > 0) lines.add(subject.slice(0, i).split("\n").length);
    }
  }
  return [...lines].sort((a, b) => a - b);
}
let readyCount = 0;
let signalReady;
const bothReady = new Promise((resolve) => { signalReady = resolve; });
let signalBeta;
const betaHit = new Promise((resolve) => { signalBeta = resolve; });
let signalAlphaDone;
const alphaDone = new Promise((resolve) => { signalAlphaDone = resolve; });

before(async () => {
  await post("Profiler.enable");
  await post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
});

beforeEach(async () => {
  await post("Profiler.takePreciseCoverage");
  if (process.env.SPIKE_MODE === "overlap") {
    readyCount++;
    if (readyCount === 2) signalReady();
  }
});

afterEach(async (t) => {
  const snapshot = await post("Profiler.takePreciseCoverage");
  const source = snapshot.result.find((entry) => entry.url === target);
  const counts = Object.fromEntries((source?.functions ?? []).filter((entry) => ["alpha", "beta"].includes(entry.functionName)).map((entry) => [entry.functionName, entry.ranges[0].count]));
  const functions = (source?.functions ?? []).filter((entry) => ["alpha", "beta"].includes(entry.functionName));
  entries.push({ name: t.name, counts, files: { [relativeSubject]: coveredLines(functions) }, ranges: { [relativeSubject]: functions } });
  if (t.name === "alpha test") signalAlphaDone();
});

after(async () => {
  await post("Profiler.stopPreciseCoverage");
  session.disconnect();
  writeFileSync(process.env.SPIKE_OUTPUT, JSON.stringify(entries));
});

describe("coverage hook experiment", { concurrency: process.env.SPIKE_MODE === "overlap" }, () => {
  test("alpha test", async () => {
    if (process.env.SPIKE_MODE === "overlap") await bothReady;
    alpha();
    if (process.env.SPIKE_MODE === "overlap") await betaHit;
  });
  test("beta test", async () => {
    if (process.env.SPIKE_MODE === "overlap") await bothReady;
    beta();
    if (process.env.SPIKE_MODE === "overlap") {
      signalBeta();
      await alphaDone;
    }
  });
});
