import type { Location } from "../model.js";

export interface RawTest {
  id: string;
  name: string;
  file: string;
  outcome: string;
  role: string;
  attribution: string;
  lines: Location[];
  totals: { lines: number };
}
export interface Envelope {
  schemaVersion: number;
  ok: boolean;
  data: Record<string, unknown>;
  pagination?: { hasMore: boolean; nextOffset: number | null };
}
export interface LineEvidence { totalAnchored: number; covered: boolean; tests: { id: string }[]; limitations: unknown[] }
type Query = (args: string[]) => Promise<Envelope>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function rawTest(value: unknown): RawTest {
  if (object(value) && value.file === undefined && (value.role === "background" || object(value.provenance) && value.provenance.runner === "command")) value = { ...value, file: "" };
  if (!object(value) || !["id", "name", "file", "outcome", "role", "attribution"].every(key => typeof value[key] === "string") || !Array.isArray(value.lines) || !object(value.totals) || typeof value.totals.lines !== "number")
    throw new Error(`Supercov individual-test response is missing identity, outcome, role or coverage: ${JSON.stringify(value)}`);
  for (const line of value.lines)
    if (!object(line) || typeof line.file !== "string" || !Number.isInteger(line.line)) throw new Error("Invalid source location");
  if (value.lines.length !== value.totals.lines) throw new Error("Supercov test coverage was truncated");
  return value as unknown as RawTest;
}

function nextOffset(page: Envelope, offset: number): number | null {
  if (!page.pagination?.hasMore) return null;
  const next = page.pagination.nextOffset;
  if (next === null || !Number.isInteger(next) || next <= offset) throw new Error("Non-progressing pagination");
  return next;
}

export async function collectTestEvidence(runId: string, query: Query): Promise<RawTest[]> {
  const entries: unknown[] = [];
  let offset = 0;
  while (true) {
    const page = await query(["runs", runId, "test", "", "--limit", "0", "--offset", String(offset), "--json"]);
    if (!Array.isArray(page.data.tests)) throw new Error("Supercov test inventory missing");
    entries.push(...page.data.tests);
    const next = nextOffset(page, offset);
    if (next === null) break;
    offset = next;
  }
  const result: RawTest[] = new Array(entries.length);
  let cursor = 0;
  let failed = false;
  const collect = async (entry: unknown): Promise<RawTest> => {
    if (!object(entry) || typeof entry.id !== "string") throw new Error("Invalid test inventory entry");
    let offset = 0;
    let first: Record<string, unknown> | undefined;
    const lines = new Map<string, Location>();
    while (true) {
      const page = await query(["runs", runId, "test", entry.id, "--limit", "0", "--offset", String(offset), "--json"]);
      if (!Array.isArray(page.data.tests) || page.data.tests.length !== 1 || !object(page.data.tests[0])) throw new Error("Individual test identity is ambiguous");
      const item = page.data.tests[0];
      if (item.id !== entry.id || !Array.isArray(item.lines) || !object(item.totals) || typeof item.totals.lines !== "number") throw new Error("Invalid individual-test page");
      if (!first) first = item;
      else if (!object(first.totals) || first.totals.lines !== item.totals.lines || first.outcome !== item.outcome || first.role !== item.role || first.attribution !== item.attribution) throw new Error("Individual-test pages disagree");
      for (const line of item.lines) {
        if (!object(line) || typeof line.file !== "string" || !Number.isInteger(line.line)) throw new Error("Invalid source location");
        lines.set(`${line.file}:${line.line}`, line as unknown as Location);
      }
      const next = nextOffset(page, offset);
      if (next === null) break;
      offset = next;
    }
    return rawTest({ ...first, lines: [...lines.values()] });
  };
  const workers = await Promise.allSettled(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (!failed && cursor < entries.length) {
      const index = cursor++;
      try { result[index] = await collect(entries[index]); }
      catch (error) { failed = true; throw error; }
    }
  }));
  for (const worker of workers)
    if (worker.status === "rejected") throw worker.reason;
  return result;
}

export async function collectLineEvidence(runId: string, locations: string[], query: Query): Promise<Record<string, LineEvidence>> {
  const result: Record<string, LineEvidence> = {};
  const missing = (location: string) => {
    result[location] = { totalAnchored: 0, covered: false, tests: [], limitations: ["Source has no measured executable obligations."] };
  };
  const collect = async (batch: string[]): Promise<void> => {
    const expected = new Set(batch);
    const failedLocations = new Set<string>();
    let offset = 0;
    while (true) {
      let page: Envelope;
      try { page = await query(["runs", runId, "line", ...batch, "--limit", "0", "--offset", String(offset), "--json"]); }
      catch (error) {
        let failure: unknown;
        try { failure = JSON.parse((error as { stdout?: string }).stdout ?? ""); } catch { /* Keep the original query error. */ }
        if (!object(failure) || failure.ok !== false || !object(failure.error) || failure.error.code !== "SOURCE_NOT_FOUND") throw error;
        // An entirely unanswered batch reports only its first error. Inspect each
        // location so a second, different failure cannot silently become a gap.
        if (batch.length === 1) missing(batch[0]);
        else for (const location of batch) await collect([location]);
        return;
      }
      const lines = Array.isArray(page.data.lines) ? page.data.lines : batch.length === 1 ? [page.data] : undefined;
      if (!lines) throw new Error("Incomplete changed-line evidence");
      for (const value of lines) {
        if (!object(value) || !object(value.location) || typeof value.location.file !== "string" || !Number.isInteger(value.location.line)) throw new Error("Invalid source location");
        const location = `${value.location.file}:${value.location.line}`;
        if (!expected.has(location) || result[location]) throw new Error("Unexpected or duplicate changed-line evidence");
        if (value.covered === undefined && value.lineObligation === false && Number.isInteger(value.totalAnchored) && Number.isInteger(value.coveredAnchored) && Number(value.totalAnchored) >= 0 && Number(value.coveredAnchored) >= 0 && Number(value.coveredAnchored) <= Number(value.totalAnchored))
          value.covered = Number(value.coveredAnchored) > 0;
        if (typeof value.totalAnchored !== "number" || typeof value.covered !== "boolean" || !Array.isArray(value.tests) || !Array.isArray(value.limitations)) throw new Error("Incomplete changed-line evidence");
        if (batch.length === 1 && page.pagination?.hasMore) throw new Error("Incomplete changed-line evidence");
        // Bulk replies sample covering tests. Complete attribution comes from
        // the independently paginated individual-test evidence, not this sample.
        result[location] = value as unknown as LineEvidence;
      }
      if (page.data.failed !== undefined && !Array.isArray(page.data.failed)) throw new Error("Invalid changed-line failures");
      for (const failure of page.data.failed as unknown[] ?? []) {
        if (!object(failure) || typeof failure.location !== "string" || !expected.has(failure.location)) throw new Error("Invalid changed-line failure");
        if (failure.code !== "SOURCE_NOT_FOUND") throw new Error(`Supercov changed-line failure: ${failure.code}`);
        // Supercov repeats unresolved locations on subsequent bulk pages.
        if (failedLocations.has(failure.location)) continue;
        if (result[failure.location]) throw new Error("Conflicting changed-line evidence");
        failedLocations.add(failure.location);
        missing(failure.location);
      }
      const next = nextOffset(page, offset);
      if (next === null) break;
      offset = next;
    }
    if (batch.some(location => !result[location])) throw new Error("Incomplete changed-line evidence");
  };
  // Bound argument size and response memory independently of project size.
  for (let start = 0; start < locations.length; start += 100)
    await collect(locations.slice(start, start + 100));
  return result;
}
