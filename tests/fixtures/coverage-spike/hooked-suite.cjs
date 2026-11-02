const { test, describe, before, beforeEach, afterEach, after } = require("node:test");
const { Session } = require("node:inspector");
const { writeFileSync } = require("node:fs");
const { pathToFileURL } = require("node:url");
const { alpha, beta } = require("./subject.cjs");

const session = new Session();
session.connect();
const post = (method, params = {}) => new Promise((resolve, reject) => {
  session.post(method, params, (error, result) => error ? reject(error) : resolve(result));
});
const entries = [];
const target = pathToFileURL(require.resolve("./subject.cjs")).href;
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
  entries.push({ name: t.name, counts });
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
