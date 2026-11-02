import type { Context, DiffLine } from "./analysis.ts";

export interface Location { file: string; line: number }
export interface TestEvidence {
  id: string;
  name: string;
  file: string;
  line: number | null;
  source: string | null;
  change: "added" | "modified" | "unchanged" | "unknown";
  diff: DiffLine[];
  outcome: string;
  attribution: string;
  executedLines: Location[];
  changedHits: Location[];
}
export interface ChangedLine extends Location {
  status: "covered" | "uncovered" | "unknown" | "not-executable";
  coveringTests: string[];
  context: Context;
}
export interface Report {
  schemaVersion: 1;
  collector: { name: "Supercov"; version: string };
  run: { id: string; exitCode: number; command: string[]; measuredAt: string };
  comparison: { base: string; head: string; workingTree: true };
  stale: boolean;
  sources: Record<string, { sha256: string; source: string }>;
  tests: TestEvidence[];
  setups: TestEvidence[];
  changedLines: ChangedLine[];
  deletedTests: { file: string; name: string; source: string }[];
  limitations: string[];
}
