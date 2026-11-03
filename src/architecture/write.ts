import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import type { ArchitectureConfiguration } from "../config.js";
import { codeArchitectureModel, readArchitectureSource, type ArchitectureEdge } from "./model.js";
import { workingTreeAliases } from "./check.js";

export type DiagramWrite = {
  changed: boolean;
  addedSlices: string[]; removedSlices: string[];
  addedEdges: string[]; removedEdges: string[];
  stagedSlices: string[];
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false });
const list = (value: any): any[] => (value == null ? [] : Array.isArray(value) ? value : [value]);
const slug = (value: string) => value.replace(/[^A-Za-z0-9]+/g, "-");
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

const BOX_STYLE = "rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;";
const STAGED_STYLE = "rounded=0;whiteSpace=wrap;html=1;dashed=1;fillColor=#ffe6cc;strokeColor=#d79b00;";
const EDGE_STYLE = "endArrow=block;html=1;";
const WIDTH = 190, HEIGHT = 60, GAP_X = 30, GAP_Y = 50, PER_ROW = 4;

type Box = { x: number; y: number; width: number; height: number; style: string; placed?: string; autoAt?: string };

function readDiagram(xml: string): { boxes: Map<string, Box>; edges: Set<string> } {
  const boxes = new Map<string, Box>();
  const edges = new Set<string>();
  try {
    const parsed = parser.parse(xml);
    const root = parsed?.mxfile?.diagram?.mxGraphModel?.root ?? parsed?.mxGraphModel?.root;
    if (!root) return { boxes, edges };
    for (const object of list(root.object)) {
      if (object.concept) {
        const cell = list(object.mxCell)[0] ?? {};
        const geometry = cell.mxGeometry ?? {};
        boxes.set(String(object.concept), {
          x: Number(geometry.x ?? 0), y: Number(geometry.y ?? 0),
          width: Number(geometry.width ?? WIDTH), height: Number(geometry.height ?? HEIGHT),
          style: String(cell.style ?? BOX_STYLE),
          ...(object.placed ? { placed: String(object.placed) } : {}),
          ...(object.autoAt ? { autoAt: String(object.autoAt) } : {}),
        });
      }
      if (object.assoc) edges.add(String(object.assoc));
    }
    for (const cell of list(root.mxCell)) if (String(cell.edge) === "1" && cell.assoc) edges.add(String(cell.assoc));
  } catch { /* an unreadable diagram is replaced from code */ }
  return { boxes, edges };
}

/** Remove an arrow whose target is still reachable through other arrows. */
function reduceEdges(edges: ArchitectureEdge[]): ArchitectureEdge[] {
  const reachable = (subset: ArchitectureEdge[], from: string, to: string) => {
    const seen = new Set([from]);
    const stack = [from];
    while (stack.length) {
      const node = stack.pop()!;
      for (const edge of subset) if (edge.from === node && !seen.has(edge.to)) { seen.add(edge.to); stack.push(edge.to); }
    }
    return seen.has(to);
  };
  return edges.filter(edge => !reachable(edges.filter(other => other !== edge), edge.from, edge.to));
}

/**
 * Rewrite `docs/architecture.drawio` from the code: existing boxes keep the position,
 * size and style a human gave them, new slices wait in a staging lane marked
 * `placed="auto"` until someone moves them, and removed slices and arrows are dropped.
 */
export function writeArchitectureDiagram(base: string, configuration: ArchitectureConfiguration, options: { accept?: boolean } = {}): DiagramWrite {
  const accept = options.accept ?? false;
  const code = codeArchitectureModel(readArchitectureSource(path.join(base, configuration.root), workingTreeAliases(base)), { slices: configuration.slices });
  const wantedEdges = (configuration.transitive ? reduceEdges(code.edges) : code.edges).slice().sort((a, b) => a.key.localeCompare(b.key));
  const slices = code.slices.map(slice => slice.name).sort();

  const diagramPath = path.join(base, configuration.diagram);
  const existing = existsSync(diagramPath) ? readFileSync(diagramPath, "utf8") : "";
  const { boxes, edges } = existing.trim() ? readDiagram(existing) : { boxes: new Map<string, Box>(), edges: new Set<string>() };

  const addedSlices = slices.filter(name => !boxes.has(name));
  const removedSlices = [...boxes.keys()].filter(name => !slices.includes(name));
  const addedEdges = wantedEdges.map(edge => edge.key).filter(key => !edges.has(key));
  const removedEdges = [...edges].filter(key => !wantedEdges.some(edge => edge.key === key)).sort();

  const bottom = boxes.size ? Math.max(...[...boxes.values()].map(box => box.y + box.height)) : 0;
  const stagedAt = (index: number): Box => {
    const x = 20 + (index % PER_ROW) * (WIDTH + GAP_X);
    const y = bottom + GAP_Y + Math.floor(index / PER_ROW) * (HEIGHT + GAP_Y);
    return { x, y, width: WIDTH, height: HEIGHT, style: STAGED_STYLE, placed: "auto", autoAt: `${x},${y}` };
  };

  const lines = [
    `<mxfile host="app.diagrams.net" modified="2026-01-01T00:00:00.000Z" agent="pi-verify" version="24.7.17">`,
    `  <diagram id="architecture" name="Architecture">`,
    `    <mxGraphModel dx="1000" dy="700" grid="1" gridSize="10" page="1" pageWidth="1200" pageHeight="700"><root>`,
    `      <mxCell id="0"/><mxCell id="1" parent="0"/>`,
  ];
  // Accepting keeps the position but drops the "machine placed this" marker and style.
  const accepted = (box: Box): Box => ({
    ...box, placed: undefined, autoAt: undefined,
    style: box.style === STAGED_STYLE ? BOX_STYLE : box.style,
  });
  const stagedSlices: string[] = [];
  slices.forEach((name, index) => {
    const kept = boxes.get(name);
    // A staged box that a human moved keeps its new position and loses the marker.
    const staged = !accept && kept && kept.placed === "auto" && kept.autoAt === `${kept.x},${kept.y}`;
    const box = kept ? (staged ? kept : accepted({ ...kept, placed: undefined, autoAt: undefined })) : accept ? accepted(stagedAt(index)) : stagedAt(index);
    if (box.placed === "auto") stagedSlices.push(name);
    const marker = box.placed === "auto" && box.autoAt ? ` placed="auto" autoAt="${escape(box.autoAt)}"` : "";
    lines.push(`      <object id="box-${slug(name)}" label="${escape(name)}" concept="${escape(name)}"${marker}><mxCell style="${box.style}" vertex="1" parent="1"><mxGeometry x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" as="geometry"/></mxCell></object>`);
  });
  for (const edge of wantedEdges) {
    lines.push(`      <object id="edge-${slug(edge.key)}" assoc="${escape(edge.key)}"><mxCell style="${EDGE_STYLE}" edge="1" parent="1" source="box-${slug(edge.from)}" target="box-${slug(edge.to)}"><mxGeometry relative="1" as="geometry"/></mxCell></object>`);
  }
  lines.push(`    </root></mxGraphModel>`, `  </diagram>`, `</mxfile>`);
  const xml = lines.join("\n") + "\n";

  const changed = xml !== existing;
  if (changed) { mkdirSync(path.dirname(diagramPath), { recursive: true }); writeFileSync(diagramPath, xml); }
  return { changed, addedSlices, removedSlices, addedEdges, removedEdges, stagedSlices: [...new Set(stagedSlices)] };
}
