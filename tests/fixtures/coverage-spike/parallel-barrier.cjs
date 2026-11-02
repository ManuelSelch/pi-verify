const { existsSync, writeFileSync } = require("node:fs");
const path = require("node:path");

module.exports = async function parallelBarrier(name, other) {
  if (!process.env.SPIKE_BARRIER) return;
  writeFileSync(path.join(process.env.SPIKE_BARRIER, name), "ready");
  const deadline = Date.now() + 5000;
  while (!existsSync(path.join(process.env.SPIKE_BARRIER, other))) {
    if (Date.now() > deadline) throw new Error("Parallel test-file barrier timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
