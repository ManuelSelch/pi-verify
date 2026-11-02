// Experimental preload: attaches to each node:test child process, not Vitest workers.
const { before, beforeEach, afterEach, after } = require("node:test");
const { Session } = require("node:inspector");
const { appendFileSync, readFileSync } = require("node:fs");
const { findSourceMap } = require("node:module");
const { fileURLToPath } = require("node:url");
const path = require("node:path");

const session = new Session();
try { session.connect(); } catch { return; }
const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
const target = path.resolve(process.env.SPIKE_TARGET);

before(async () => {
  await post("Debugger.enable");
  await post("Profiler.enable");
  await post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
});
beforeEach(async () => { await post("Profiler.takePreciseCoverage"); });
afterEach(async (t) => {
  const snapshot = await post("Profiler.takePreciseCoverage");
  const script = snapshot.result.find((entry) => entry.url.startsWith("file:") && fileURLToPath(entry.url) === target);
  const code = script ? (await post("Debugger.getScriptSource", { scriptId: script.scriptId })).scriptSource : readFileSync(target, "utf8");
  const map = findSourceMap(target);
  const lines = new Map();
  if (script && map) {
    for (const fn of script.functions) {
      // The already-loaded module wrapper does not represent this test's execution.
      if (!fn.functionName) continue;
      const [root, ...blocks] = fn.ranges;
      for (let offset = root.startOffset; offset < root.endOffset; offset++) {
        if (/\s/.test(code[offset])) continue;
        let count = root.count;
        for (const block of blocks) if (offset >= block.startOffset && offset < block.endOffset) count = block.count;
        if (count <= 0) continue;
        const beforeOffset = code.slice(0, offset);
        const generatedLine = beforeOffset.split("\n").length - 1;
        const generatedColumn = offset - (beforeOffset.lastIndexOf("\n") + 1);
        const hit = map.findEntry(generatedLine, generatedColumn);
        if (!hit.originalSource || hit.originalLine === undefined) continue;
        const source = hit.originalSource.startsWith("file:") ? fileURLToPath(hit.originalSource) : hit.originalSource;
        if (!lines.has(source)) lines.set(source, new Set());
        lines.get(source).add(hit.originalLine + 1);
      }
    }
  }
  appendFileSync(process.env.SPIKE_OUTPUT, JSON.stringify({ name: t.name, pid: process.pid, files: Object.fromEntries([...lines].map(([file, hits]) => [file, [...hits].sort((a, b) => a - b)])), sourceMapFound: !!map }) + "\n");
});
after(async () => { await post("Profiler.stopPreciseCoverage"); session.disconnect(); });
