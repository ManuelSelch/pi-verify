const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let npm;
before(async () => { npm = await import(require("node:url").pathToFileURL(require("node:path").resolve(process.env.SPIKE_TARGET)).href); });
test("resolves the installed npm", () => { assert.match(npm.resolveNpmCli(), /npm-cli\.js$/); });
test("rejects a relative executable", () => { assert.throws(() => npm.resolveNpmCli("node"), /Cannot resolve installed npm CLI/); });
