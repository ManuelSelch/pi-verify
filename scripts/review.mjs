import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Repository-local workflow; the public review CLI remains measurement-free. */
export function createUpstreamReview({ cwd = process.cwd(), run = spawnSync } = {}) {
  const git = run("git", ["merge-base", "HEAD", "@{upstream}"], { cwd, encoding: "utf8" });
  if (git.error || git.status !== 0 || !git.stdout?.trim()) throw new Error("Cannot resolve upstream comparison; configure this branch's upstream first. No fetch is performed.");
  const base = git.stdout.trim();
  const cli = path.join(cwd, "dist", "src", "cli.js");
  const evidence = path.join(cwd, ".pi-verify", "coverage", "report.json");
  // Never import an older successful measurement after a failed collector launch.
  rmSync(evidence, { force: true });
  const collect = run(process.execPath, [cli, "collect-coverage", "--base", base], { cwd, stdio: "inherit" });
  if (collect.error) throw collect.error;
  if (!existsSync(evidence)) throw new Error(`Coverage collection produced no report (exit ${collect.status ?? "unknown"}).`);
  const review = run(process.execPath, [cli, "review", "--base", base, "--coverage-report", evidence], { cwd, stdio: "inherit" });
  if (review.error) throw review.error;
  return review.status || collect.status || (review.signal || collect.signal ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = createUpstreamReview(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
