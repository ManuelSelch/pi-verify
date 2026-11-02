import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkModel, codeModel, diagramModel, diffModel, type Model } from "./model.js";

const exec = promisify(execFile);
export const diagramPath = "docs/conceptual-model.drawio";
export const sourcePath = "src/review-report/domain/model.ts";
export type ConceptualReview = {
  base: string | null; target: string; basePresent: boolean | null; targetPresent: boolean;
  before: Model | null; after: Model | null; delta: ReturnType<typeof diffModel> | null;
  guardrail: { status: "passed" | "failed" | "unavailable"; diagnostics: string[] };
  diagramXml: string | null;
};

export async function collectConceptualModel(repository: string, base: string | null, target: string): Promise<ConceptualReview> {
  const git = async (...args: string[]) => (await exec("git", args, { cwd: repository, maxBuffer: 10 * 1024 * 1024 })).stdout;
  await git("rev-parse", "--verify", `${target}^{commit}`);
  if (base) await git("rev-parse", "--verify", `${base}^{commit}`);
  const blob = async (ref: string, file: string): Promise<string | null> => {
    const names = (await git("ls-tree", "--name-only", ref, "--", file)).trim().split("\n");
    if (!names.includes(file)) return null;
    return git("show", `${ref}:${file}`);
  };
  const [oldXml, newXml, source] = await Promise.all([base ? blob(base, diagramPath) : null, blob(target, diagramPath), blob(target, sourcePath)]);
  const before = oldXml ? diagramModel(oldXml) : null;
  const after = newXml ? diagramModel(newXml) : null;
  let guardrail: ConceptualReview["guardrail"];
  if (!after || !source) guardrail = { status: "unavailable", diagnostics: [!after ? "Target diagram is absent." : "Target TypeScript source is absent."] };
  else {
    const diagnostics = checkModel(codeModel(source), after);
    guardrail = { status: diagnostics.length ? "failed" : "passed", diagnostics };
  }
  return { base, target, basePresent: base ? !!oldXml : null, targetPresent: !!newXml, before, after, delta: base ? diffModel(before, after) : null, guardrail, diagramXml: newXml };
}
