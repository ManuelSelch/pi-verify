import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { resolveArchitectureWorkspace } from "./workspace.js";

const exec = promisify(execFile);

/** Open the configured diagram in VS Code, falling back to the system default app. */
export async function openArchitectureDiagram(cwd: string): Promise<{ ok: boolean; message: string }> {
  const workspace = await resolveArchitectureWorkspace(cwd);
  if (!workspace) return { ok: false, message: "Architecture is not configured." };
  const file = path.join(workspace.base, workspace.configuration.diagram);
  if (!existsSync(file)) return { ok: false, message: `Architecture diagram not found: ${workspace.configuration.diagram}` };
  const url = `vscode://file${encodeURI(file)}`;
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32.exe" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  try { await exec(opener, args); }
  catch { await exec(opener, [file]); }
  return { ok: true, message: `Opened ${workspace.configuration.diagram}.` };
}
