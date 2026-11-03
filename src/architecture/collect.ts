import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { aliasesFromConfig, checkArchitecture, codeArchitectureModel, diagramArchitectureModel, diffArchitectureModel, isArchitectureFile, unusedEdges, type ArchitectureAlias, type ArchitectureModel } from "./model.js";
import { configurationPath, parseConfiguration } from "../config.js";

const exec = promisify(execFile);

/** tsconfig `compilerOptions.paths`, read from the same ref as the sources. */
async function tsconfigAliases(blob: (ref: string, file: string) => Promise<string | null>, ref: string, repository: string, root: string): Promise<{ aliases: ArchitectureAlias[]; aliasBase: string } | null> {
  const candidates = [...new Set([path.posix.normalize(path.posix.join(path.posix.dirname(root), "tsconfig.json")), "tsconfig.json"])];
  for (const candidate of candidates) {
    const text = await blob(ref, candidate);
    if (!text) continue;
    const aliases = aliasesFromConfig(candidate, text, path.join(repository, path.posix.dirname(candidate)));
    if (aliases) return aliases;
  }
  return null;
}

/**
 * Where `.pi/pi-verify.json` lives in the target tree: the repository root, or the package
 * directory of the nearest one to the working directory.
 */
async function locateConfiguration(git: (...args: string[]) => Promise<string>, ref: string, repository: string): Promise<{ configPath: string; prefix: string } | null> {
  const names = (await git("ls-tree", "-r", "-z", "--name-only", ref)).split("\0").filter(Boolean);
  const located = names
    .filter(name => name === configurationPath || name.endsWith(`/${configurationPath}`))
    .map(name => ({ configPath: name, prefix: name === configurationPath ? "" : path.posix.dirname(path.posix.dirname(name)) }));
  if (!located.length) return null;
  const root = located.find(entry => entry.prefix === "." || entry.prefix === "");
  if (root) return { configPath: root.configPath, prefix: "" };
  const relative = path.relative(repository, process.cwd()).split(path.sep).join("/");
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    const match = located
      .filter(entry => relative === entry.prefix || relative.startsWith(`${entry.prefix}/`))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0];
    if (match) return match;
  }
  return located.length === 1 ? located[0] : null;
}

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

  const location = await locateConfiguration(git, target, repository);
  if (!location) return null;
  const withPrefix = (file: string) => location.prefix ? `${location.prefix}/${file}` : file;

  const [oldConfiguration, newConfiguration] = await Promise.all([
    base ? blob(base, location.configPath).then(json => parseConfiguration(json).architecture) : null,
    blob(target, location.configPath).then(json => parseConfiguration(json).architecture),
  ]);
  if (!newConfiguration) return null;

  const [oldXml, newXml] = await Promise.all([
    base && oldConfiguration ? blob(base, withPrefix(oldConfiguration.diagram)) : null,
    blob(target, withPrefix(newConfiguration.diagram)),
  ]);
  const root = withPrefix(newConfiguration.root);
  const files = await sourceFiles(target, root);
  const aliases = await tsconfigAliases(blob, target, repository, root);
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
    const code = codeArchitectureModel({ files, root: path.join(repository, root), ...(aliases ? { aliases: aliases.aliases, aliasBase: aliases.aliasBase } : {}) }, { slices: newConfiguration.slices });
    const diagnostics = checkArchitecture(code, after, { strict: newConfiguration.strict, transitive: newConfiguration.transitive });
    guardrail = { status: diagnostics.length ? "failed" : "passed", diagnostics, unused: unusedEdges(code, after) };
  }
  return { base, target, basePresent: base ? !!oldXml : null, targetPresent: !!newXml, before, after, delta: base ? diffArchitectureModel(before, after) : null, guardrail, diagramXml: newXml };
}
