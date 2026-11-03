import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

test("explicit revisions and custom output are available to preview", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pi-verify-options-"));
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString().trim();
    git("init"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
    writeFileSync(path.join(dir, "a"), "base"); git("add", "."); git("commit", "-m", "base");
    const base = git("rev-parse", "HEAD");
    writeFileSync(path.join(dir, "a"), "new"); git("commit", "-am", "new");
    const result = spawnSync(process.execPath, [cli, "review", "--base", base, "--target", "HEAD", "--output", "custom"], { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(path.join(dir, "custom", "pi-verify-report.json"), "utf8"));
    assert.equal(report.review.comparison.method, "explicit");
    assert.equal(report.review.comparison.base, base);
    assert.equal(readFileSync(path.join(dir, ".pi-verify", "latest-report.txt"), "utf8").trim(), path.join(realpathSync(dir), "custom", "pi-verify-report.html"));
    if (process.platform !== "win32") {
      const bin = path.join(dir, "bin"); mkdirSync(bin);
      const opener = process.platform === "darwin" ? "open" : "xdg-open";
      writeFileSync(path.join(bin, opener), `#!/bin/sh\nprintf '%s' "$1" > '${dir}/opened'\n`, { mode: 0o755 });
      const preview = spawnSync(process.execPath, [cli, "preview"], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
      assert.equal(preview.status, 0, preview.stderr);
      assert.equal(readFileSync(path.join(dir, "opened"), "utf8"), path.join(realpathSync(dir), "custom", "pi-verify-report.html"));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("unknown options are rejected", () => {
  const result = spawnSync(process.execPath, [cli, "review", "--unknown", "value"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid option/);
});
