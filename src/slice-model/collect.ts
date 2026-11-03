import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkSlices, codeSliceModel, diagramSliceModel, diffSliceModel, isSliceFile, unusedAssociations, type SliceModel } from "./model.js";
import { configurationPath, parseConfiguration } from "../config.js";

const exec = promisify(execFile);

export type SliceReview = {
  base: string | null; target: string; basePresent: boolean | null; targetPresent: boolean;
  before: SliceModel | null; after: SliceModel | null; delta: ReturnType<typeof diffSliceModel> | null;
  guardrail: { status: "passed" | "failed" | "unavailable"; diagnostics: string[]; unused: string[] };
  diagramXml: string | null;
};

/** Returns null when the project has not configured a slice diagram. */
export async function collectSliceModel(repository: string, base: string | null, target: string): Promise<SliceReview | null> {
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
    const selected = listing.filter(file => file.startsWith(prefix) && isSliceFile(file.slice(prefix.length)));
    const contents = await Promise.all(selected.map(async file => [file.slice(prefix.length), await git("show", `${ref}:${file}`)] as const));
    return new Map(contents);
  };

  const [oldConfiguration, newConfiguration] = await Promise.all([
    base ? blob(base, configurationPath).then(json => parseConfiguration(json).sliceModel) : null,
    blob(target, configurationPath).then(json => parseConfiguration(json).sliceModel),
  ]);
  if (!newConfiguration) return null;

  const [oldXml, newXml] = await Promise.all([
    base && oldConfiguration ? blob(base, oldConfiguration.diagram) : null,
    blob(target, newConfiguration.diagram),
  ]);
  const files = await sourceFiles(target, newConfiguration.root);
  const before = oldXml ? diagramSliceModel(oldXml) : null;
  const after = newXml ? diagramSliceModel(newXml) : null;

  let guardrail: SliceReview["guardrail"];
  if (!after || !files.size)
    guardrail = {
      status: "unavailable",
      diagnostics: [after ? "No TypeScript sources were found under the configured root." : "Target slice diagram is absent."],
      unused: [],
    };
  else {
    const code = codeSliceModel({ files });
    const diagnostics = checkSlices(code, after, { strict: newConfiguration.strict });
    guardrail = { status: diagnostics.length ? "failed" : "passed", diagnostics, unused: unusedAssociations(code, after) };
  }
  return { base, target, basePresent: base ? !!oldXml : null, targetPresent: !!newXml, before, after, delta: base ? diffSliceModel(before, after) : null, guardrail, diagramXml: newXml };
}
