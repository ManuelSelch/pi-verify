import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkArchitecture, codeArchitectureModel, diagramArchitectureModel, diffArchitectureModel, isArchitectureFile, unusedEdges, type ArchitectureModel } from "./model.js";
import { configurationPath, parseConfiguration } from "../config.js";

const exec = promisify(execFile);

export type ArchitectureReview = {
  base: string | null; target: string; basePresent: boolean | null; targetPresent: boolean;
  before: ArchitectureModel | null; after: ArchitectureModel | null; delta: ReturnType<typeof diffArchitectureModel> | null;
  guardrail: { status: "passed" | "failed" | "unavailable"; diagnostics: string[]; unused: string[] };
  diagramXml: string | null;
};

/** Returns null when the project has not configured an architecture diagram. */
export async function collectArchitecture(repository: string, base: string | null, target: string): Promise<ArchitectureReview | null> {
  const git = async (...args: string[]) => (await exec("git", args, { cwd: repository, maxBuffer: 64 * 1024 * 1024 })).stdout;
  await git("rev-parse", "--verify", `${target}^{commit}`);
  if (base) await git("rev-parse", "--verify", `${base}^{commit}`);
  const blob = async (ref: string, file: string): Promise<string | null> => {
    const names = (await git("--literal-pathspecs", "ls-tree", "-z", "--name-only", ref, "--", file)).split("\0");
    if (!names.includes(file)) return null;
    return git("show", `${ref}:${file}`);
  };
  const sourceFiles = async (ref: string, root: string): Promise<Map<string, string>> => {
    const prefix = `${root}/`;
    const listing = (await git("--literal-pathspecs", "ls-tree", "-r", "-z", "--name-only", ref, "--", root)).split("\0").filter(Boolean);
    const selected = listing.filter(file => file.startsWith(prefix) && isArchitectureFile(file.slice(prefix.length)));
    const contents = await Promise.all(selected.map(async file => [file.slice(prefix.length), await git("show", `${ref}:${file}`)] as const));
    return new Map(contents);
  };

  const [oldConfiguration, newConfiguration] = await Promise.all([
    base ? blob(base, configurationPath).then(json => parseConfiguration(json).architecture) : null,
    blob(target, configurationPath).then(json => parseConfiguration(json).architecture),
  ]);
  if (!newConfiguration) return null;

  const [oldXml, newXml] = await Promise.all([
    base && oldConfiguration ? blob(base, oldConfiguration.diagram) : null,
    blob(target, newConfiguration.diagram),
  ]);
  const files = await sourceFiles(target, newConfiguration.root);
  const before = oldXml ? diagramArchitectureModel(oldXml) : null;
  const after = newXml ? diagramArchitectureModel(newXml) : null;

  let guardrail: ArchitectureReview["guardrail"];
  if (!after || !files.size)
    guardrail = {
      status: "unavailable",
      diagnostics: [after ? "No TypeScript sources were found under the configured root." : "Target architecture diagram is absent."],
      unused: [],
    };
  else {
    const code = codeArchitectureModel({ files });
    const diagnostics = checkArchitecture(code, after, { strict: newConfiguration.strict });
    guardrail = { status: diagnostics.length ? "failed" : "passed", diagnostics, unused: unusedEdges(code, after) };
  }
  return { base, target, basePresent: base ? !!oldXml : null, targetPresent: !!newXml, before, after, delta: base ? diffArchitectureModel(before, after) : null, guardrail, diagramXml: newXml };
}
