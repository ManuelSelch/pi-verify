import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { configurationPath } from "../config.js";
import { resolveArchitectureWorkspace } from "./workspace.js";
import { writeArchitectureDiagram } from "./write.js";

const exec = promisify(execFile);

export type Approval = { ok: boolean; message: string; committed: boolean };

/**
 * Accept the current placement and commit only the architecture files. It never pushes and
 * never stages unrelated work, so a feature in progress stays untouched.
 */
export async function approveArchitecture(cwd: string): Promise<Approval> {
  const workspace = await resolveArchitectureWorkspace(cwd);
  if (!workspace) return { ok: false, message: `Architecture is not configured: no ${configurationPath} found.`, committed: false };
  const { repository, base, configuration } = workspace;
  const result = writeArchitectureDiagram(base, configuration, { accept: true });
  const files = [path.join(base, configuration.diagram), path.join(base, configurationPath)]
    .filter(existsSync)
    .map(file => path.relative(repository, file));
  const status = await exec("git", ["status", "--porcelain", "--", ...files], { cwd: repository });
  if (!status.stdout.trim()) return { ok: true, message: "Architecture is already committed; nothing to approve.", committed: false };
  const summary = `+${result.addedSlices.length}/-${result.removedSlices.length} slices, +${result.addedEdges.length}/-${result.removedEdges.length} arrows`;
  await exec("git", ["add", "--", ...files], { cwd: repository });
  await exec("git", ["commit", "-m", `docs(architecture): approve placement (${summary})`, "--", ...files], { cwd: repository });
  return { ok: true, message: `Committed ${files.join(", ")} (${summary}).`, committed: true };
}
