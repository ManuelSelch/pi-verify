import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export type SliceEdge = { from: string; to: string };
export type SliceModel = { slices: string[]; edges: SliceEdge[]; errors: string[] };
export type CodeOptions = { root: string; compilerOptions?: ts.CompilerOptions; exclude?: RegExp[] };

const DEFAULT_EXCLUDE = [
  /(^|[\\/])node_modules[\\/]/,
  /(^|[\\/])dist[\\/]/,
  /(^|[\\/])\.git[\\/]/,
  /\.d\.ts$/,
  /\.(test|spec)\.[cm]?tsx?$/,
  /(^|[\\/])__tests__[\\/]/,
];

const key = (e: SliceEdge) => `${e.from}->${e.to}`;

export function readCompilerOptions(root: string): ts.CompilerOptions {
  const configPath = path.join(root, "tsconfig.json");
  if (!fs.existsSync(configPath)) return { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext };
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  return ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const SUPPORTED = /\.[cm]?tsx?$/;

/** Folders under `root` as slices; cross-folder relative imports as directed edges. */
export function codeSliceModel(options: CodeOptions): SliceModel {
  const root = path.resolve(options.root);
  const compilerOptions = options.compilerOptions ?? readCompilerOptions(root);
  const exclude = [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])];
  const slices = new Set<string>();
  const edges = new Set<string>();
  const errors: string[] = [];

  const files = walk(root).filter(file => {
    const rel = path.relative(root, file);
    return SUPPORTED.test(file) && !exclude.some(re => re.test(rel));
  });

  for (const file of files) {
    const rel = path.relative(root, file);
    const segments = rel.split(path.sep);
    if (segments.length < 2) continue; // a root-level file belongs to no folder slice
    const from = segments[0];
    slices.add(from);

    const { importedFiles } = ts.preProcessFile(fs.readFileSync(file, "utf8"), true, true);
    for (const imported of importedFiles) {
      const specifier = imported.fileName;
      if (!specifier.startsWith(".")) continue; // bare specifiers are external packages
      const resolved = ts.resolveModuleName(specifier, file, compilerOptions, ts.sys).resolvedModule?.resolvedFileName;
      if (!resolved) {
        errors.push(`${rel}: cannot resolve "${specifier}"`);
        continue;
      }
      const resolvedRel = path.relative(root, path.resolve(resolved));
      if (resolvedRel.startsWith("..")) continue; // resolves outside this slice root
      const targetSegments = resolvedRel.split(path.sep);
      if (targetSegments.length < 2) continue; // a root-level file is not a folder slice
      const target = targetSegments[0];
      if (target === from) continue; // inside the same slice
      slices.add(target);
      edges.add(`${from}->${target}`);
    }
  }

  return {
    slices: [...slices].sort(),
    edges: [...edges].sort().map(k => {
      const [from, to] = k.split("->");
      return { from, to };
    }),
    errors,
  };
}

const list = (value: any): any[] => (value == null ? [] : Array.isArray(value) ? value : [value]);

/** The diagram as slices: boxes carry concept="<folder>", arrows assoc="<from>-><to>". */
export function diagramSliceModel(xml: string): SliceModel {
  if (XMLValidator.validate(xml) !== true) throw new Error("Invalid draw.io XML");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsupported XML: DOCTYPE/ENTITY is not allowed");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false });
  const parsed = parser.parse(xml);
  if (list(parsed.mxfile?.diagram).length > 1) throw new Error("Multiple diagram pages are not supported");
  const diagram = list(parsed.mxfile?.diagram)[0];
  const root = (diagram?.mxGraphModel ?? parsed.mxGraphModel)?.root;
  if (!root) throw new Error("Expected an uncompressed draw.io mxGraphModel");

  const cells = [...list(root.mxCell), ...list(root.object).map((object: any) => ({ ...object.mxCell, ...object }))];
  const errors: string[] = [];
  const idToSlice = new Map<string, string>();
  const slices: string[] = [];

  for (const cell of cells.filter((c: any) => c.concept)) {
    const name = String(cell.concept);
    if (idToSlice.has(String(cell.id))) errors.push(`duplicate cell id ${cell.id}`);
    if (slices.includes(name)) errors.push(`duplicate slice box "${name}"`);
    idToSlice.set(String(cell.id), name);
    slices.push(name);
  }

  const edges: SliceEdge[] = [];
  const seen = new Set<string>();
  for (const edge of cells.filter((c: any) => String(c.edge) === "1")) {
    const from = idToSlice.get(String(edge.source));
    const to = idToSlice.get(String(edge.target));
    if (!from || !to) {
      errors.push(`arrow ${edge.id ?? "?"} does not connect two slice boxes`);
      continue;
    }
    if (!edge.assoc) {
      errors.push(`undeclared arrow ${from} -> ${to}: add assoc="${from}->${to}"`);
      continue;
    }
    if (String(edge.assoc) !== `${from}->${to}`) errors.push(`arrow assoc "${edge.assoc}" does not match its endpoints ${from} -> ${to}`);
    if (seen.has(`${from}->${to}`)) errors.push(`duplicate arrow ${from}->${to}`);
    seen.add(`${from}->${to}`);
    edges.push({ from, to });
  }

  return { slices: [...new Set(slices)].sort(), edges: edges.sort((a, b) => key(a).localeCompare(key(b))), errors };
}

export type SliceCheckResult = { errors: string[]; unused: string[] };

/**
 * Default (allow-list): every code dependency must be an arrow, and boxes must match the
 * code's folders both ways. An arrow the code does not (yet) use is reported, not failed.
 * `strict` additionally fails unused arrows, i.e. requires the two graphs to be equal.
 */
export function checkSlices(code: SliceModel, diagram: SliceModel, options: { strict?: boolean } = {}): SliceCheckResult {
  const errors = [...diagram.errors, ...code.errors];
  const codeSlices = new Set(code.slices);
  const diagramSlices = new Set(diagram.slices);

  for (const slice of code.slices) if (!diagramSlices.has(slice)) errors.push(`missing slice box "${slice}": the folder has no box in the diagram`);
  for (const slice of diagram.slices) if (!codeSlices.has(slice)) errors.push(`extra slice box "${slice}": no such folder exists in the code`);

  const codeEdges = new Set(code.edges.map(key));
  const diagramEdges = new Set(diagram.edges.map(key));
  const unused: string[] = [];

  for (const edge of diagram.edges) {
    if (codeEdges.has(key(edge))) continue;
    if (options.strict) errors.push(`unused arrow ${key(edge)}: the code does not import it`);
    else unused.push(key(edge));
  }
  for (const edge of code.edges) if (!diagramEdges.has(key(edge))) errors.push(`undeclared dependency ${key(edge)}: not an arrow in the diagram`);

  return { errors, unused: unused.sort() };
}
