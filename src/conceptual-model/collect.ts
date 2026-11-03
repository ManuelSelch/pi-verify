import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkModel, codeModel, diagramModel, diffModel, type Model } from "./model.js";
import { configurationPath, parseConfiguration } from "../config.js";

const exec = promisify(execFile);

export type ConceptualReview = {
  base: string | null; target: string; basePresent: boolean | null; targetPresent: boolean;
  before: Model | null; after: Model | null; delta: ReturnType<typeof diffModel> | null;
  guardrail: { status: "passed" | "failed" | "unavailable"; diagnostics: string[] };
  diagramXml: string | null;
};

/** Returns null when the project has disabled the conceptual model in its configuration. */
export async function collectConceptualModel(repository: string, base: string | null, target: string): Promise<ConceptualReview | null> {
  const git = async (...args: string[]) => (await exec("git", args, { cwd: repository, maxBuffer: 10 * 1024 * 1024 })).stdout;
  await git("rev-parse", "--verify", `${target}^{commit}`);
  if (base) await git("rev-parse", "--verify", `${base}^{commit}`);
  const blob = async (ref: string, file: string): Promise<string | null> => {
    const names = (await git("--literal-pathspecs", "ls-tree", "-z", "--name-only", ref, "--", file)).split("\0");
    if (!names.includes(file)) return null;
    return git("show", `${ref}:${file}`);
  };
  const [oldConfiguration, newConfiguration] = await Promise.all([
    base ? blob(base, configurationPath).then(json => parseConfiguration(json).conceptualModel) : null,
    blob(target, configurationPath).then(json => parseConfiguration(json).conceptualModel),
  ]);
  if (!newConfiguration) return null;
  const [oldXml, newXml, source] = await Promise.all([
    base && oldConfiguration ? blob(base, oldConfiguration.diagram) : null,
    blob(target, newConfiguration.diagram),
    newConfiguration.source ? blob(target, newConfiguration.source) : null,
  ]);
  const before = oldXml ? diagramModel(oldXml) : null;
  const after = newXml ? diagramModel(newXml) : null;
  let guardrail: ConceptualReview["guardrail"];
  if (!after || !newConfiguration.source || !source) guardrail = { status: "unavailable", diagnostics: [!after ? "Target diagram is absent." : !newConfiguration.source ? "Source-code conformance checking is not configured; diagram comparison only." : "Target TypeScript source is absent."] };
  else {
    const diagnostics = checkModel(codeModel(source), after);
    guardrail = { status: diagnostics.length ? "failed" : "passed", diagnostics };
  }
  return { base, target, basePresent: base ? !!oldXml : null, targetPresent: !!newXml, before, after, delta: base ? diffModel(before, after) : null, guardrail, diagramXml: newXml };
}
