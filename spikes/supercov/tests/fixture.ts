import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const exec = promisify(execFile);
export const baseSource = `export function price(total: number, member: boolean): number {
  if (total < 0) throw new Error("Invalid price");
  if (member) {
    return total * (80 / 100);
  }
  if (total > 500) {
    return total - 10;
  }
  return total;
}

export function setupOnly(): number {
  return 42;
}

export function alpha(): string {
  return "alpha";
}

export function beta(): string {
  return "beta";
}
`;
export const targetSource = baseSource.replace("total * (80 / 100)", "total * 0.8").replace("total - 10", "total - 25");
const baseTests = `import test from "node:test";
import assert from "node:assert/strict";
import { price } from "../src/pricing.ts";

test("applies a member discount", () => {
  assert.equal(price(100, true), 80);
});

test("keeps the regular price", () => {
  assert.equal(price(100, false), 100);
});
`;
const targetTests = baseTests.replace("price(100, false), 100", "price(200, false), 200") + `
test("rejects a negative price", () => {
  assert.throws(() => price(-1, false));
});
`;
const overlapTests = `import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { alpha, beta, setupOnly } from "../src/pricing.ts";

beforeEach(() => { assert.equal(setupOnly(), 42); });
let releaseAlpha: () => void;
let releaseBeta: () => void;
const alphaReached = new Promise<void>(resolve => { releaseAlpha = resolve; });
const betaReached = new Promise<void>(resolve => { releaseBeta = resolve; });

describe("overlap", { concurrency: true }, () => {
  test("alpha branch", async () => {
    await Promise.resolve();
    assert.equal(alpha(), "alpha");
    releaseAlpha();
    await betaReached;
  });
  test("beta branch", async () => {
    await alphaReached;
    assert.equal(beta(), "beta");
    releaseBeta();
  });
});
`;

export class Fixture {
  directory = "";
  async prepare(mode: "normal" | "overlap" | "failure" | "compiled" = "normal", parent = tmpdir()): Promise<void> {
    await mkdir(parent, { recursive: true });
    this.directory = await mkdtemp(path.join(parent, "pi-verify-supercov-"));
    await mkdir(path.join(this.directory, "src"));
    await mkdir(path.join(this.directory, "tests"));
    await writeFile(path.join(this.directory, "package.json"), JSON.stringify({
      name: "supercov-typescript-fixture", private: true, type: "module",
      scripts: mode === "compiled" ? { build: "tsc -p tsconfig.json", test: "npm run build && node --enable-source-maps --test dist/tests/*.test.js" } : { test: "node --experimental-strip-types --test tests/*.test.ts" },
    }, null, 2));
    await writeFile(path.join(this.directory, ".gitignore"), ".supercov/\nartifacts/\nrun-id.txt\nnode_modules/\ndist/\n");
    if (mode === "compiled") {
      await symlink(fileURLToPath(new URL("../node_modules", import.meta.url)), path.join(this.directory, "node_modules"), "dir");
      await writeFile(path.join(this.directory, "tsconfig.json"), JSON.stringify({
        compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", rootDir: ".", outDir: "dist", sourceMap: true, rewriteRelativeImportExtensions: true, strict: true, skipLibCheck: true, types: ["node"] },
        include: ["src/*.ts", "tests/*.ts"],
      }, null, 2));
    }
    await writeFile(path.join(this.directory, "src/pricing.ts"), baseSource);
    await writeFile(path.join(this.directory, "tests/pricing.test.ts"), baseTests);
    await this.git("init", "-q");
    await this.git("add", "package.json", ".gitignore", "src/pricing.ts", "tests/pricing.test.ts");
    if (mode === "compiled") await this.git("add", "tsconfig.json");
    await this.git("-c", "user.name=Coverage Spike", "-c", "user.email=spike@example.invalid", "commit", "-qm", "Baseline fixture");
    await writeFile(path.join(this.directory, "src/pricing.ts"), targetSource);
    const body = mode === "overlap" ? overlapTests : mode === "failure" ? targetTests.replace("price(100, true), 80", "price(100, true), 999") : targetTests;
    await writeFile(path.join(this.directory, "tests/pricing.test.ts"), body);
  }
  async git(...args: string[]): Promise<string> {
    return (await exec("git", args, { cwd: this.directory, timeout: 10000 })).stdout.trim();
  }
  async editSource(): Promise<void> {
    const file = path.join(this.directory, "src/pricing.ts");
    await writeFile(file, (await readFile(file, "utf8")) + "\n// Changed after measurement\n");
  }
  async dispose(): Promise<void> {
    if (this.directory) await rm(this.directory, { recursive: true, force: true });
  }
}
