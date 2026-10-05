import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type Outcome = "passed" | "failed" | "skipped" | "unknown";

export type TestEntry = {
  name: string;
  file: string;
  behavior: string;
  outcome: Outcome;
  evidence?: string[];
  source?: string;
};

export type CheckEntry = {
  command: string;
  cwd?: string;
  outcome: Outcome;
  exitCode?: number;
  evidence?: string;
  note?: string;
};

export type CommitEntry = { sha: string; subject: string; author: string; authoredAt: string };
export type ArtifactEntry = { label: string; path: string; type?: string; description?: string; sha256?: string; size?: number };

export type VerificationReport = {
  goal: string;
  verdict: string;
  source?: Record<string, unknown>;
  commits?: CommitEntry[];
  changes?: Array<{ file: string; summary: string }>;
  tests?: TestEntry[];
  checks?: CheckEntry[];
  executedTests?: CheckEntry[];
  criteria?: unknown[];
  evidence?: unknown[];
  gate?: Record<string, unknown>;
  artifacts?: ArtifactEntry[];
  skipped?: string[];
  limitations?: string[];
  review?: Record<string, unknown>;
};

export function reportJson(report: VerificationReport): string {
  return JSON.stringify({ schemaVersion: 1, ...report }, null, 2) + "\n";
}

export async function writeReportBundle(directory: string, report: VerificationReport): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, "pi-verify-report.json");
  const markdownPath = path.join(directory, "pi-verify-report.md");
  await writeFile(jsonPath, reportJson(report));
  await writeFile(markdownPath, reportMarkdown(report, directory));
  return { jsonPath, markdownPath };
}

function markdownFileLink(filePath: string, reportDirectory?: string, label = filePath): string {
  const href = reportDirectory
    ? encodeURI(path.relative(reportDirectory, filePath).split(path.sep).join("/") || path.basename(filePath)).replaceAll("#", "%23").replaceAll("(", "%28").replaceAll(")", "%29")
    : pathToFileURL(filePath).href;
  return `[${label.replaceAll("[", "\\[").replaceAll("]", "\\]")}](${href})`;
}

function tableText(value: unknown): string {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll(/\s+/g, " ").trim();
}

function simpleDate(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : value;
}

export function reportMarkdown(report: VerificationReport, reportDirectory?: string): string {
  const changes = report.changes ?? [];
  const tests = report.tests ?? [];
  const checks = report.checks ?? [];
  const commits = report.commits ?? [];
  const artifacts = report.artifacts ?? [];
  const passingChecks = checks.filter((check) => check.outcome === "passed").length;
  const source = report.source ?? {};
  const lines = ["# Verification Report", "", `**Verdict:** \`${report.verdict}\``, `**Goal:** ${report.goal}`, "", "## Summary", "", `- **Checks:** ${passingChecks}/${checks.length} passed`, `- **Working tree:** ${source.clean === true ? "clean" : "not clean"}`, `- **Commits:** ${commits.length}`];

  lines.push("", "## Changed files", "");
  lines.push(...(changes.length ? ["| File | Summary |", "|---|---|", ...changes.map((item) => `| \`${tableText(item.file)}\` | ${tableText(item.summary)} |`)] : ["No changed files recorded."]));

  lines.push("", "## Added or changed tests", "");
  if (tests.length) {
    lines.push(...tests.map((entry) => `- **${tableText(entry.name)}** — \`${tableText(entry.file)}\`${entry.behavior ? ` — ${tableText(entry.behavior)}` : ""}${entry.outcome ? ` (${entry.outcome})` : ""}`));
  } else lines.push("No added or changed tests recorded.");

  lines.push("", "## Added commits", "");
  lines.push(...(commits.length ? commits.map((commit) => `- ${tableText(commit.subject)} — ${tableText(commit.author)}, ${simpleDate(commit.authoredAt)}`) : ["No added commits identified."]));

  lines.push("", "## Evidence", "");
  const evidenceLinks = artifacts.length ? artifacts.map((artifact) => `- **${tableText(artifact.label)}**${artifact.type ? ` (${artifact.type})` : ""}: ${markdownFileLink(artifact.path, reportDirectory, path.basename(artifact.path))}`) : [];
  lines.push(...(evidenceLinks.length ? evidenceLinks : ["No additional evidence artifacts recorded."]));

  const skipped = report.skipped ?? [];
  const limitations = report.limitations ?? [];
  if (skipped.length || limitations.length) {
    lines.push("", "## Notes", "", ...skipped.map((item) => `- Skipped: ${item}`), ...limitations.map((item) => `- Limitation: ${item}`));
  }
  return lines.join("\n") + "\n";
}
