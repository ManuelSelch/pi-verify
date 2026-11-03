import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { configurationPath, parseConfiguration, type ArchitectureConfiguration } from "../config.js";

const exec = promisify(execFile);

function realpathOr(value: string): string {
  try { return realpathSync(value); }
  catch { return path.resolve(value); }
}

export async function repositoryRoot(cwd: string): Promise<string> {
  try { return realpathOr((await exec("git", ["rev-parse", "--show-toplevel"], { cwd })).stdout.trim()); }
  catch { return realpathOr(cwd); }
}

/** Nearest `.pi/pi-verify.json` from the working directory up to the repository root. */
export function configurationDirectory(repository: string, cwd: string): string {
  const repo = realpathOr(repository);
  let current = realpathOr(cwd);
  while (true) {
    if (existsSync(path.join(current, configurationPath))) return current;
    if (current === repo || path.relative(repo, current).startsWith("..")) return repo;
    const parent = path.dirname(current);
    if (parent === current) return repo;
    current = parent;
  }
}

export type ArchitectureWorkspace = { repository: string; base: string; configuration: ArchitectureConfiguration };

/** Resolve the repository, the directory holding the configuration, and the architecture settings. */
export async function resolveArchitectureWorkspace(cwd: string): Promise<ArchitectureWorkspace | null> {
  const repository = await repositoryRoot(cwd);
  const base = configurationDirectory(repository, cwd);
  let json: string | null = null;
  try { json = await readFile(path.join(base, configurationPath), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const configuration = parseConfiguration(json).architecture;
  return configuration ? { repository, base, configuration } : null;
}
