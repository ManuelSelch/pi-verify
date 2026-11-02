import ts from "typescript";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export type Concept = { name: string; label: string; x: number; y: number; width: number; height: number };
export type Association = { key: string; from: string; to: string; fromMarker: string; toMarker: string };
export type Model = { concepts: Concept[]; associations: Association[]; errors: string[] };
const pair = (a: string, b: string) => [a, b].sort().join("-");
const list = (value: any): any[] => value == null ? [] : Array.isArray(value) ? value : [value];

// Scope is deliberately explicit: exported type aliases in one domain file. A reference
// inside an array or Record is many; this is structural, not a runtime object graph.
export function codeModel(source: string): Model {
  const file = ts.createSourceFile("model.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if ((file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.length) throw new Error("Cannot parse TypeScript model source");
  if (file.statements.some(s => ts.isInterfaceDeclaration(s) && s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))) throw new Error("Exported interfaces are not supported by this conceptual model extractor");
  const types = file.statements.filter((s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && !!s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
  const names = new Set(types.map(t => t.name.text));
  const relations = new Map<string, Association>();
  for (const type of types) {
    const from = type.name.text;
    const visit = (node: ts.Node, many: boolean) => {
      if (ts.isArrayTypeNode(node)) return visit(node.elementType, true);
      if (ts.isTypeReferenceNode(node)) {
        const name = node.typeName.getText(file);
        if (names.has(name) && name !== from) {
          const key = pair(from, name);
          const relation = relations.get(key) ?? { key, from: key.split("-")[0], to: key.split("-")[1], fromMarker: "", toMarker: "" };
          if (many) {
            if (relation.from === name) relation.fromMarker = "*";
            else relation.toMarker = "*";
          }
          relations.set(key, relation);
          return;
        }
        for (const arg of node.typeArguments ?? []) visit(arg, many || name === "Record" || name === "Array" || name === "ReadonlyArray");
        return;
      }
      ts.forEachChild(node, child => visit(child, many));
    };
    visit(type.type, false);
  }
  return { concepts: [...names].sort().map(name => ({ name, label: name, x: 0, y: 0, width: 0, height: 0 })), associations: [...relations.values()].sort((a, b) => a.key.localeCompare(b.key)), errors: [] };
}

export function diagramModel(xml: string): Model {
  if (XMLValidator.validate(xml) !== true || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Invalid or unsupported draw.io XML");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false });
  const parsed = parser.parse(xml);
  if (list(parsed.mxfile?.diagram).length > 1) throw new Error("Multiple diagram pages are not supported");
  const diagram = list(parsed.mxfile?.diagram)[0];
  const root = (diagram?.mxGraphModel ?? parsed.mxGraphModel)?.root;
  if (!root) throw new Error("Expected an uncompressed draw.io mxGraphModel");
  const cells = [...list(root.mxCell).map(cell => ({ ...cell })), ...list(root.object).map(object => ({ ...object.mxCell, ...object, mxCell: undefined }))];
  const errors: string[] = [];
  const concepts: Concept[] = [];
  const ids = new Map<string, string>();
  for (const c of cells.filter(c => c.concept)) {
    if (ids.has(c.id) || concepts.some(item => item.name === c.concept)) errors.push(`duplicate concept ${c.concept}`);
    ids.set(c.id, c.concept);
    const g = c.mxGeometry ?? {};
    const concept = { name: String(c.concept), label: String(c.label ?? c.value ?? ""), x: Number(g.x ?? 0), y: Number(g.y ?? 0), width: Number(g.width ?? 120), height: Number(g.height ?? 50) };
    if (concept.label !== concept.name) errors.push(`concept ${concept.name} label does not match identity`);
    if (c.placed === "auto") errors.push(`concept ${concept.name} is awaiting human placement`);
    concepts.push(concept);
  }
  const associations: Association[] = [];
  for (const edge of cells.filter(c => String(c.edge) === "1")) {
    const from = ids.get(edge.source), to = ids.get(edge.target);
    if (!from && !to && !edge.assoc) continue;
    if (!from || !to) { errors.push(`association ${edge.assoc ?? edge.id} has a non-concept endpoint`); continue; }
    if (!edge.assoc) { errors.push(`undeclared association ${from}-${to}`); continue; }
    if (edge.assoc !== pair(from, to)) errors.push(`association ${edge.assoc} has wrong endpoints ${from}-${to}`);
    if (associations.some(a => a.key === edge.assoc)) errors.push(`duplicate association ${edge.assoc}`);
    const labels = cells.filter(c => c.parent === edge.id && c.value != null);
    if (labels.some(c => ![-1, 1].includes(Math.sign(Number(c.mxGeometry?.x ?? 0))))) errors.push(`association ${edge.assoc} has an ambiguous cardinality label`);
    const marker = (sign: number) => labels.filter(c => Math.sign(Number(c.mxGeometry?.x ?? 0)) === sign).map(c => String(c.value)).join(",");
    associations.push({ key: String(edge.assoc), from, to, fromMarker: marker(-1), toMarker: marker(1) });
  }
  if (!concepts.length) errors.push("diagram has no concepts");
  return { concepts, associations, errors };
}

function markers(a: Association): string { return [a.from, a.to].sort().map(name => `${name}:${a.from === name ? a.fromMarker : a.toMarker}`).join("|"); }
export function checkModel(expected: Model, actual: Model): string[] {
  const errors = [...actual.errors];
  for (const [kind, left, right] of [["concept", expected.concepts.map(c => c.name), actual.concepts.map(c => c.name)], ["association", expected.associations.map(a => a.key), actual.associations.map(a => a.key)]] as const) {
    for (const name of left) if (!right.includes(name)) errors.push(`missing ${kind} ${name}`);
    for (const name of right) if (!left.includes(name)) errors.push(`extra ${kind} ${name}`);
  }
  for (const association of actual.associations) {
    const truth = expected.associations.find(a => a.key === association.key);
    if (truth && markers(truth) !== markers(association)) errors.push(`association ${association.key} cardinality differs from code`);
  }
  return errors;
}

export function diffModel(old: Model | null, current: Model | null): { added: string[]; removed: string[]; changed: string[] } {
  const entries = (model: Model | null) => new Map<string, string>([...(model?.concepts ?? []).map(c => [`concept ${c.name}`, c.label] as const), ...(model?.associations ?? []).map(a => [`association ${a.key}`, markers(a)] as const)]);
  const before = entries(old), after = entries(current);
  return { added: [...after.keys()].filter(key => !before.has(key)).sort(), removed: [...before.keys()].filter(key => !after.has(key)).sort(), changed: [...after.keys()].filter(key => before.has(key) && before.get(key) !== after.get(key)).sort() };
}
