import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkModel, codeModel, diagramModel, diffModel, type Model } from "./model.js";

const exec = promisify(execFile);
const configurationPath = ".pi/conceptual-model.json";
type Configuration = { diagram: string; source?: string };

function configuration(json: string | null): Configuration {
  if (json === null) return { diagram: "docs/conceptual-model.drawio" };
  const value = JSON.parse(json);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => key !== "diagram" && key !== "source"))
    throw new Error("Conceptual model configuration must contain diagram and optionally source.");
  const relativePath = (name: string, file: unknown): string => {
    if (typeof file !== "string" || /[\\\\:\u0000-\u001f\u007f]/.test(file) || file.split("/").some(part => !part || part === "." || part === ".."))
      throw new Error(`Conceptual model ${name} must be a repository-relative file path.`);
    return file;
  };
  return { diagram: relativePath("diagram", value.diagram), ...("source" in value ? { source: relativePath("source", value.source) } : {}) };
}
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
    const names = (await git("--literal-pathspecs", "ls-tree", "-z", "--name-only", ref, "--", file)).split("\0");
    if (!names.includes(file)) return null;
    return git("show", `${ref}:${file}`);
  };
  const [oldConfiguration, newConfiguration] = await Promise.all([
    base ? blob(base, configurationPath).then(configuration) : null,
    blob(target, configurationPath).then(configuration),
  ]);
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
