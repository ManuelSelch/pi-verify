import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ArchitectureConfiguration } from "../config.js";
import { aliasesFromConfig, checkArchitecture, codeArchitectureModel, diagramArchitectureModel, readArchitectureSource, unusedEdges, type ArchitectureAlias } from "./model.js";

export type WorkingTreeCheck = { errors: string[]; unused: string[] };

/** tsconfig `compilerOptions.paths` next to the project, when present and valid. */
function workingTreeAliases(base: string): { aliases: ArchitectureAlias[]; aliasBase: string } | null {
  const file = path.join(base, "tsconfig.json");
  if (!existsSync(file)) return null;
  try { return aliasesFromConfig(file, readFileSync(file, "utf8"), base); }
  catch { return null; }
}

/** Check the working tree, not committed revisions, against the configured diagram. */
export function checkWorkingTree(base: string, configuration: ArchitectureConfiguration): WorkingTreeCheck {
  const code = codeArchitectureModel(readArchitectureSource(path.join(base, configuration.root), workingTreeAliases(base)), { slices: configuration.slices });
  const diagramPath = path.join(base, configuration.diagram);
  if (!existsSync(diagramPath)) throw new Error(`Architecture diagram not found: ${configuration.diagram}`);
  const diagram = diagramArchitectureModel(readFileSync(diagramPath, "utf8"));
  return { errors: checkArchitecture(code, diagram, { strict: configuration.strict }), unused: unusedEdges(code, diagram) };
}
