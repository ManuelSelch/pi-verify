export const configurationPath = ".pi/pi-verify.json";

export type ArchitectureConfiguration = { diagram: string; root: string; strict: boolean };
export type PiVerifyConfiguration = { architecture: ArchitectureConfiguration | null };

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

function architectureConfiguration(value: unknown): ArchitectureConfiguration {
  const object = entry("architecture", value, ["diagram", "root", "strict"]);
  const strict = object.strict ?? false;
  if (typeof strict !== "boolean") throw new Error("pi-verify architecture strict must be a boolean.");
  return { diagram: relativePath("architecture diagram", object.diagram), root: relativePath("architecture root", object.root), strict };
}

/**
 * One configuration for pi-verify. The architecture diagram maps top-level folders to
 * slices and arrow-checks relative imports between them. It is off unless configured.
 */
export function parseConfiguration(json: string | null): PiVerifyConfiguration {
  if (json === null) return { architecture: null };
  const root = entry("configuration", JSON.parse(json), ["architecture"]);
  const architecture = root.architecture === undefined || root.architecture === null ? null : architectureConfiguration(root.architecture);
  return { architecture };
}
