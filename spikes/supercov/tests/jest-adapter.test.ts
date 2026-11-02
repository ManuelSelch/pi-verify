import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "./fixture.ts";
import { measure, buildReport } from "../src/collector.ts";
import { writeReport } from "../src/report.ts";
import { importCoverage } from "../../../src/review-report/infra/coverage.ts";

test("Jest in a repository subdirectory reports per-test TypeScript coverage", async t => {
  const repo = await mkdtemp(path.join(tmpdir(), "pi-verify-jest-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  const root = path.join(repo, "frontend");
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tests"));
  await symlink(fileURLToPath(new URL("../node_modules", import.meta.url)), path.join(root, "node_modules"), "dir");
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "jest-fixture", private: true, scripts: { test: "jest --runInBand" } }));
  await writeFile(path.join(root, "jest.config.cjs"), `module.exports = { testEnvironment: 'jsdom', transform: { '^.+\\\\.tsx?$': ['ts-jest', { tsconfig: { module: 'CommonJS', jsx: 'react-jsx', types: ['jest'], skipLibCheck: true } }] }, testMatch: ['**/*.test.tsx'] };\n`);
  await writeFile(path.join(root, "src/calculate.ts"), "export const first = () => 1;\nexport const second = () => 2;\n");
  await writeFile(path.join(root, "tests/calculate.test.tsx"), `import { first, second } from '../src/calculate';\ndescribe('calculation', () => {\n  test('first', () => expect(first()).toBe(1));\n  test('second', () => expect(second()).toBe(2));\n  test.each([[1], [2]])('parameter %i', (n) => expect(n).toBeGreaterThan(0));\n});\n`);
  const git = async (...args: string[]) => (await exec("git", args, { cwd: repo })).stdout.trim();
  await git("init", "-q"); await git("add", "frontend/package.json", "frontend/jest.config.cjs", "frontend/src", "frontend/tests");
  await git("-c", "user.name=Example", "-c", "user.email=example@example.invalid", "commit", "-qm", "base");
  const base = await git("rev-parse", "HEAD");
  await writeFile(path.join(root, "src/calculate.ts"), "export const first = () => 1 + 0;\nexport const second = () => 2;\n");
  await git("add", "frontend/src/calculate.ts"); await git("-c", "user.name=Example", "-c", "user.email=example@example.invalid", "commit", "-qm", "change");

  const measurement = await measure({ root, base, sourceFiles: ["src/calculate.ts"], testFiles: ["tests/calculate.test.tsx"], outputDirectory: path.join(repo, "output") });
  const report = await buildReport(measurement);

  assert.equal(report.run.exitCode, 0);
  const first = report.tests.find(item => item.name === "calculation > first");
  const second = report.tests.find(item => item.name === "calculation > second");
  assert.ok(first && second, JSON.stringify(report.tests.map(item => item.name)));
  assert.equal(first.outcome, "passed");
  assert.ok(first.changedHits.some(item => item.file === "src/calculate.ts" && item.line === 1));
  assert.equal(second.changedHits.length, 0);
  assert.ok(first.source?.includes("first"));
  assert.equal(first.change, "unchanged");
  assert.equal(report.comparison.projectPath, "frontend");
  await writeReport(report, path.join(repo, "output"));
  const imported = await importCoverage(repo, path.join(repo, "output/report.json"), base, await git("rev-parse", "HEAD"));
  assert.equal(imported.tests.find(item => item.name === first.name)?.changedHits.length, 1);
  const parameterized = report.tests.filter(item => item.name.includes("parameter"));
  assert.equal(parameterized.length, 2);
  assert.ok(parameterized.every(item => item.outcome === "passed" && item.change === "unknown" && item.source === null));

  await writeFile(path.join(root, "tests/calculate.test.tsx"), `import { first } from '../src/calculate';\ntest('failure', () => expect(first()).toBe(999));\n`);
  const failedMeasurement = await measure({ root, base, sourceFiles: ["src/calculate.ts"], testFiles: ["tests/calculate.test.tsx"], outputDirectory: path.join(repo, "failed") });
  const failedReport = await buildReport(failedMeasurement);
  assert.notEqual(failedReport.run.exitCode, 0);
  assert.equal(failedReport.tests.find(item => item.name === "failure")?.outcome, "failed");

  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "jest-fixture", private: true, scripts: { test: "node -e \"process.exit(3)\"" } }));
  const commandFailure = await measure({ root, base, sourceFiles: ["src/calculate.ts"], testFiles: ["tests/calculate.test.tsx"], outputDirectory: path.join(repo, "command-failed") });
  assert.notEqual(commandFailure.exitCode, 0);
  const incomplete = await buildReport(commandFailure);
  assert.equal(incomplete.tests.find(item => item.name === "failure")?.outcome, "unknown");
});
