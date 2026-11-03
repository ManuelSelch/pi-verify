export const configurationPath = ".pi/pi-verify.json";
const defaultConceptualDiagram = "docs/conceptual-model.drawio";

export type ConceptualModelConfiguration = { diagram: string; source?: string };
export type SliceModelConfiguration = { diagram: string; root: string; strict: boolean };
export type PiVerifyConfiguration = { conceptualModel: ConceptualModelConfiguration | null; sliceModel: SliceModelConfiguration | null };

function relativePath(name: string, value: unknown): string {
  if (typeof value !== "string" || /[\\:\u0000-\u001f\u007f]/.test(value) || value.split("/").some(part => !part || part === "." || part === ".."))
    throw new Error(`pi-verify ${name} must be a repository-relative path.`);
  return value;
}

function entry(name: string, value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`pi-verify ${name} must be an object.`);
  const object = value as Record<string, unknown>;
  const unknown = Object.keys(object).filter(key => !allowed.includes(key));
  if (unknown.length) throw new Error(`pi-verify ${name} has unknown fields: ${unknown.join(", ")}.`);
  return object;
}

function conceptualModelConfiguration(value: unknown): ConceptualModelConfiguration {
  const object = entry("conceptualModel", value, ["diagram", "source"]);
  return {
    diagram: relativePath("conceptualModel diagram", object.diagram),
    ...(object.source === undefined ? {} : { source: relativePath("conceptualModel source", object.source) }),
  };
}

function sliceModelConfiguration(value: unknown): SliceModelConfiguration {
  const object = entry("sliceModel", value, ["diagram", "root", "strict"]);
  const strict = object.strict ?? false;
  if (typeof strict !== "boolean") throw new Error("pi-verify sliceModel strict must be a boolean.");
  return { diagram: relativePath("sliceModel diagram", object.diagram), root: relativePath("sliceModel root", object.root), strict };
}

/**
 * One configuration for every pi-verify diagram. An absent file, or an absent
 * `conceptualModel` key, keeps the conventional conceptual diagram; `null` disables a
 * section explicitly. `sliceModel` is off unless configured.
 */
export function parseConfiguration(json: string | null): PiVerifyConfiguration {
  if (json === null) return { conceptualModel: { diagram: defaultConceptualDiagram }, sliceModel: null };
  const root = entry("configuration", JSON.parse(json), ["conceptualModel", "sliceModel"]);
  const conceptualModel = root.conceptualModel === undefined
    ? { diagram: defaultConceptualDiagram }
    : root.conceptualModel === null ? null : conceptualModelConfiguration(root.conceptualModel);
  const sliceModel = root.sliceModel === undefined || root.sliceModel === null ? null : sliceModelConfiguration(root.sliceModel);
  return { conceptualModel, sliceModel };
}
