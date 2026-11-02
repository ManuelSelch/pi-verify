import path from "node:path";
import { measure, buildReport } from "./src/collector.ts";
import { writeReport } from "./src/report.ts";

const values = new Map<string, string[]>();
const allowed = new Set(["--root", "--base", "--source", "--test", "--out"]);
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 2) {
  const key = args[index], value = args[index + 1];
  if (!allowed.has(key) || !value || value.startsWith("--"))
    throw new Error("Usage: npm run collect -- --root <project> --base <ref> --source <file.ts> --test <test.ts> --out <directory>. Repeat --source/--test as needed. Executes npm test through Supercov.");
  values.set(key, [...(values.get(key) ?? []), value]);
}
for (const key of allowed)
  if (!values.has(key)) throw new Error(`Missing required option: ${key}`);
for (const key of ["--root", "--base", "--out"])
  if (values.get(key)!.length !== 1) throw new Error(`Specify ${key} exactly once`);
const outputDirectory = path.resolve(values.get("--out")![0]);
const measurement = await measure({
  root: path.resolve(values.get("--root")![0]), base: values.get("--base")![0],
  sourceFiles: values.get("--source")!, testFiles: values.get("--test")!, outputDirectory,
});
const report = await buildReport(measurement);
await writeReport(report, outputDirectory);
console.log(`Report: ${path.join(outputDirectory, "index.html")}`);
console.log(`Test exit: ${report.run.exitCode}; stale: ${report.stale}`);
if (report.run.exitCode !== 0) process.exitCode = report.run.exitCode;
else if (report.stale) process.exitCode = 2;
