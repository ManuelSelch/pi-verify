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
  artifacts?: Array<{ label: string; path: string }>;
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
  const lines = ["# Verification Report", "", `**Goal:** ${report.goal}`];
  const source = report.source ?? {};
  const checks = report.checks ?? [];
  const passingChecks = checks.filter((check) => check.outcome === "passed").length;
  const gate = report.gate ?? {};
  const commits = report.commits ?? [];

  lines.push("", "## Executive summary", "", `- **Verdict:** \`${report.verdict}\``);
  if (typeof gate.passing_criteria === "number" && typeof gate.total_criteria === "number") lines.push(`- **Acceptance:** ${gate.passing_criteria}/${gate.total_criteria} criteria passing`);
  lines.push(`- **Checks:** ${passingChecks}/${checks.length} checks passing`, `- **Source:** ${source.clean === true ? "clean" : "not clean"}`, `- **Created commits:** ${commits.length}`);

  lines.push("", "## Source", "");
  if (typeof source.repository === "string") lines.push(`- **Repository:** ${markdownFileLink(source.repository, reportDirectory, source.repository)}`);
  if (source.branch || source.head) lines.push(`- **Revision:** \`${String(source.branch ?? "detached")}\` at \`${String(source.head ?? "unknown").slice(0, 12)}\``);
  if (source.baseline) lines.push(`- **Baseline:** \`${String(source.baseline).slice(0, 12)}\` (${String(source.baselineMethod ?? "unknown")})`);
  lines.push(`- **Working tree:** ${source.clean === true ? "clean" : "not clean"}`);
  for (const key of ["staged", "unstaged", "untracked"] as const) {
    const files = source[key];
    if (Array.isArray(files) && files.length) lines.push(`- **${key}:** ${files.map(String).join(", ")}`);
  }

  lines.push("", "## Created commits", "");
  lines.push(...(commits.length ? commits.map((commit) => `- \`${commit.sha.slice(0, 12)}\` ${commit.subject} — ${commit.author}, ${simpleDate(commit.authoredAt)}`) : ["No created commits could be identified from the detected baseline."]));

  lines.push("", "## Changes", "", "Change summaries are agent-authored.", "");
  const changes = report.changes ?? [];
  lines.push(...(changes.length ? ["| File | Summary |", "|---|---|", ...changes.map((item) => `| \`${tableText(item.file)}\` | ${tableText(item.summary)} |`)] : ["No changed files recorded."]));

  lines.push("", "## Added and modified tests", "");
  const tests = report.tests ?? [];
  if (tests.length) {
    lines.push("| Test | File | Behavior | Result | Evidence |", "|---|---|---|---|---|");
    for (const test of tests) lines.push(`| \`${tableText(test.name)}\` | \`${tableText(test.file)}\` | ${tableText(test.behavior)} | ${test.outcome} | ${(test.evidence ?? []).join(", ") || "—"} |`);
    lines.push("", "Test descriptions/classification are agent-authored unless a parser is recorded as the source.");
  } else lines.push("No added or modified tests recorded; this is not automatically a failure.");

  const artifactByLabel = new Map((report.artifacts ?? []).map((item) => [item.label, item.path]));
  lines.push("", "## Checks", "");
  if (checks.length) {
    lines.push("| Evidence | Check | Result | Exit code |", "|---|---|---|---:|");
    for (const check of checks) {
      const evidencePath = check.evidence ? artifactByLabel.get(check.evidence) : undefined;
      const evidence = check.evidence ? evidencePath ? markdownFileLink(evidencePath, reportDirectory, check.evidence) : check.evidence : "—";
      const label = check.note || tableText(check.command).slice(0, 100);
      lines.push(`| ${evidence} | ${tableText(label)} | ${check.outcome} | ${check.exitCode ?? "—"} |`);
    }
  } else lines.push("No checks recorded.");
  lines.push("", "Exact commands and output remain available in the linked evidence logs and JSON report.");

  lines.push("", "## Acceptance criteria", "");
  const criteria = (report.criteria ?? []) as Array<{ id?: string; status?: string; description?: string; evidence?: string[] }>;
  if (criteria.length) {
    lines.push("| ID | Status | Criterion | Evidence |", "|---|---|---|---|");
    for (const criterion of criteria) lines.push(`| ${criterion.id ?? "—"} | ${criterion.status ?? "unknown"} | ${tableText(criterion.description)} | ${(criterion.evidence ?? []).join(", ") || "—"} |`);
  } else lines.push("No acceptance criteria recorded.");

  lines.push("", "## Gate", "", `- **Verdict:** ${String(gate.verdict ?? report.verdict)}`, `- **Allowed:** ${String(gate.allowed ?? "unknown")}`);
  const issues = Array.isArray(gate.issues) ? gate.issues : [];
  const sourceIssues = Array.isArray(gate.source_issues) ? gate.source_issues : [];
  lines.push(...[...issues, ...sourceIssues].map((issue) => `- **Issue:** ${String(issue)}`));

  lines.push("", "## Artifacts", "");
  const artifacts = report.artifacts ?? [];
  lines.push(...(artifacts.length ? artifacts.map((item) => `- **${item.label}:** ${markdownFileLink(item.path, reportDirectory, path.basename(item.path))}`) : ["No artifacts recorded."]));
  lines.push("", "## Skipped checks", "", ...(report.skipped?.length ? report.skipped.map((item) => `- ${item}`) : ["- None recorded."]));
  lines.push("", "## Limitations", "", ...(report.limitations?.length ? report.limitations.map((item) => `- ${item}`) : ["- None recorded."]));
  lines.push("", "## Review provenance", "");
  if (report.review) {
    const records = report.review.records as { reviews?: unknown[] } | undefined;
    lines.push(`- **Kind:** ${String(report.review.kind ?? "unknown")}`, `- **Source:** ${String(report.review.source ?? "unknown")}`, `- **Reviews:** ${records?.reviews?.length ?? 0}`);
  } else lines.push("- Not recorded.");
  return lines.join("\n") + "\n";
}
