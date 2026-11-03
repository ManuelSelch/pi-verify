import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ArchitectureConfiguration } from "../config.js";
import { checkArchitecture, codeArchitectureModel, diagramArchitectureModel, readArchitectureSource, unusedEdges } from "./model.js";

export type WorkingTreeCheck = { errors: string[]; unused: string[] };

/** Check the working tree, not committed revisions, against the configured diagram. */
export function checkWorkingTree(base: string, configuration: ArchitectureConfiguration): WorkingTreeCheck {
  const code = codeArchitectureModel(readArchitectureSource(path.join(base, configuration.root)));
  const diagramPath = path.join(base, configuration.diagram);
  if (!existsSync(diagramPath)) throw new Error(`Architecture diagram not found: ${configuration.diagram}`);
  const diagram = diagramArchitectureModel(readFileSync(diagramPath, "utf8"));
  return { errors: checkArchitecture(code, diagram, { strict: configuration.strict }), unused: unusedEdges(code, diagram) };
}
