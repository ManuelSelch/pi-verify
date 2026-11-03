import path from "node:path";
import ts from "typescript";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export type SliceConcept = { name: string; label: string; x: number; y: number; width: number; height: number };
export type SliceEdge = { key: string; from: string; to: string };
export type SliceModel = { concepts: SliceConcept[]; edges: SliceEdge[]; errors: string[] };
export type SliceSource = { files: Map<string, string> };

const posix = (value: string) => value.replaceAll("\\", "/");
const pair = (from: string, to: string) => `${from}->${to}`;
const list = (value: any): any[] => (value == null ? [] : Array.isArray(value) ? value : [value]);

const SUPPORTED = /\.[cm]?tsx?$/;
const DEFAULT_EXCLUDE = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)\.git\//,
  /\.d\.[cm]?ts$/,
  /\.(test|spec)\.[cm]?tsx?$/,
  /(^|\/)__tests__\//,
];
const RESOLUTION_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const JS_REPLACEMENTS: Record<string, string[]> = { ".js": [".ts", ".tsx"], ".jsx": [".tsx", ".ts"], ".mjs": [".mts"], ".cjs": [".cts"] };

/** Only tracked TypeScript sources that can form a slice participate. */
export function isSliceFile(file: string): boolean {
  const normalized = posix(file);
  return SUPPORTED.test(normalized) && !DEFAULT_EXCLUDE.some(pattern => pattern.test(normalized));
}

function resolveRelative(fromFile: string, specifier: string, paths: Set<string>): string | null {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  const bases = new Set([base]);
  for (const [from, alternatives] of Object.entries(JS_REPLACEMENTS))
    if (base.endsWith(from)) for (const alternative of alternatives) bases.add(base.slice(0, -from.length) + alternative);
  const candidates: string[] = [];
  for (const candidate of bases) {
    if (paths.has(candidate)) return candidate;
    for (const extension of RESOLUTION_EXTENSIONS) candidates.push(`${candidate}${extension}`);
    for (const extension of RESOLUTION_EXTENSIONS) candidates.push(`${candidate}/index${extension}`);
  }
  return candidates.find(candidate => paths.has(candidate)) ?? null;
}

/**
 * Top-level folders as slices, relative imports between them as directed edges.
 * A file directly under the root belongs to no slice; unresolved specifiers (assets,
 * external files) are ignored, since architecture does not depend on them.
 */
export function codeSliceModel(source: SliceSource): SliceModel {
  const files = new Map([...source.files].map(([file, content]) => [posix(file), content]));
  const paths = new Set(files.keys());
  const slices = new Set<string>();
  const edges = new Map<string, SliceEdge>();

  for (const [file, content] of files) {
    const segments = file.split("/");
    if (segments.length < 2 || !isSliceFile(file)) continue;
    const from = segments[0];
    slices.add(from);
    const { importedFiles } = ts.preProcessFile(content, true, true);
    for (const imported of importedFiles) {
      if (!imported.fileName.startsWith(".")) continue;
      const resolved = resolveRelative(file, imported.fileName, paths);
      if (!resolved) continue;
      const targetSegments = resolved.split("/");
      if (targetSegments.length < 2) continue;
      const to = targetSegments[0];
      if (to === from) continue;
      slices.add(to);
      edges.set(pair(from, to), { key: pair(from, to), from, to });
    }
  }

  return {
    concepts: [...slices].sort().map(name => ({ name, label: name, x: 0, y: 0, width: 0, height: 0 })),
    edges: [...edges.values()].sort((a, b) => a.key.localeCompare(b.key)),
    errors: [],
  };
}

/** The diagram as slices: boxes carry concept="<folder>", arrows assoc="<from>-><to>". */
export function diagramSliceModel(xml: string): SliceModel {
  if (XMLValidator.validate(xml) !== true || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Invalid or unsupported draw.io XML");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false });
  const parsed = parser.parse(xml);
  if (list(parsed.mxfile?.diagram).length > 1) throw new Error("Multiple diagram pages are not supported");
  const diagram = list(parsed.mxfile?.diagram)[0];
  const root = (diagram?.mxGraphModel ?? parsed.mxGraphModel)?.root;
  if (!root) throw new Error("Expected an uncompressed draw.io mxGraphModel");

  const cells = [...list(root.mxCell), ...list(root.object).map((object: any) => ({ ...object.mxCell, ...object }))];
  const errors: string[] = [];
  const concepts: SliceConcept[] = [];
  const idToName = new Map<string, string>();
  const names = new Set<string>();
  for (const cell of cells.filter((c: any) => c.concept)) {
    const name = String(cell.concept);
    if (idToName.has(String(cell.id)) || names.has(name)) errors.push(`duplicate slice ${name}`);
    idToName.set(String(cell.id), name);
    names.add(name);
    const label = String(cell.label ?? cell.value ?? name);
    if (label !== name) errors.push(`slice ${name} label does not match its folder name`);
    const geometry = cell.mxGeometry ?? {};
    concepts.push({ name, label, x: Number(geometry.x ?? 0), y: Number(geometry.y ?? 0), width: Number(geometry.width ?? 140), height: Number(geometry.height ?? 50) });
  }

  const edges: SliceEdge[] = [];
  const seen = new Set<string>();
  for (const edge of cells.filter((c: any) => String(c.edge) === "1")) {
    const from = idToName.get(String(edge.source));
    const to = idToName.get(String(edge.target));
    if (!from || !to) { errors.push(`association ${edge.assoc ?? edge.id} has a non-slice endpoint`); continue; }
    if (!edge.assoc) { errors.push(`undeclared association ${from} -> ${to}`); continue; }
    if (String(edge.assoc) !== pair(from, to)) errors.push(`association ${edge.assoc} has wrong endpoints ${from} -> ${to}`);
    if (seen.has(pair(from, to))) errors.push(`duplicate association ${pair(from, to)}`);
    seen.add(pair(from, to));
    edges.push({ key: pair(from, to), from, to });
  }
  if (!concepts.length) errors.push("diagram has no slices");

  return {
    concepts: concepts.sort((a, b) => a.name.localeCompare(b.name)),
    edges: edges.sort((a, b) => a.key.localeCompare(b.key)),
    errors,
  };
}

/** Arrows the diagram allows but the code does not (yet) use. */
export function unusedAssociations(code: SliceModel, diagram: SliceModel): string[] {
  const used = new Set(code.edges.map(edge => edge.key));
  return diagram.edges.map(edge => edge.key).filter(key => !used.has(key)).sort();
}

/**
 * Slice boxes must match the code's folders both ways. Arrows are an allow-list: every
 * code dependency must be an arrow, while an unused arrow is tolerated unless `strict`.
 */
export function checkSlices(code: SliceModel, diagram: SliceModel, options: { strict?: boolean } = {}): string[] {
  const errors = [...code.errors, ...diagram.errors];
  const codeSlices = new Set(code.concepts.map(concept => concept.name));
  const diagramSlices = new Set(diagram.concepts.map(concept => concept.name));
  for (const name of codeSlices) if (!diagramSlices.has(name)) errors.push(`missing slice ${name}`);
  for (const name of diagramSlices) if (!codeSlices.has(name)) errors.push(`extra slice ${name}`);
  const diagramEdges = new Set(diagram.edges.map(edge => edge.key));
  const codeEdges = new Set(code.edges.map(edge => edge.key));
  if (options.strict) for (const edge of diagramEdges) if (!codeEdges.has(edge)) errors.push(`unused association ${edge}`);
  for (const edge of codeEdges) if (!diagramEdges.has(edge)) errors.push(`undeclared association ${edge}`);
  return errors;
}

export function diffSliceModel(before: SliceModel | null, after: SliceModel | null): { added: string[]; removed: string[]; changed: string[] } {
  const entries = (model: SliceModel | null) => new Map<string, string>([
    ...(model?.concepts ?? []).map(concept => [`slice ${concept.name}`, concept.label] as const),
    ...(model?.edges ?? []).map(edge => [`association ${edge.key}`, edge.key] as const),
  ]);
  const old = entries(before), current = entries(after);
  return {
    added: [...current.keys()].filter(key => !old.has(key)).sort(),
    removed: [...old.keys()].filter(key => !current.has(key)).sort(),
    changed: [...current.keys()].filter(key => old.has(key) && old.get(key) !== current.get(key)).sort(),
  };
}
