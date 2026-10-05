import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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
  await writeFile(markdownPath, reportMarkdown(report));
  return { jsonPath, markdownPath };
}

export function reportMarkdown(report: VerificationReport): string {
  const lines = ["# Verification Report", "", `**Verdict:** \`${report.verdict}\``, `**Goal:** ${report.goal}`, "", "## Source", ""];
  const source = report.source ?? {};
  lines.push(...(Object.keys(source).length ? Object.entries(source).map(([key, value]) => `- **${key}:** ${Array.isArray(value) ? value.join(", ") || "none" : String(value)}`) : ["- Not recorded"]));

  lines.push("", "## Created commits", "");
  const commits = report.commits ?? [];
  lines.push(...(commits.length ? commits.map((commit) => `- \`${commit.sha.slice(0, 12)}\` ${commit.subject} — ${commit.author}, ${commit.authoredAt}`) : ["No created commits could be identified from the detected baseline."]));

  lines.push("", "## Changes", "", "Change summaries are agent-authored.", "");
  const changes = report.changes ?? [];
  lines.push(...(changes.length ? ["| File | Summary |", "|---|---|", ...changes.map((item) => `| \`${item.file}\` | ${item.summary} |`)] : ["No changed files recorded."]));

  lines.push("", "## Added and modified tests", "");
  const tests = report.tests ?? [];
  if (tests.length) {
    lines.push("| Test | File | Behavior | Result | Evidence |", "|---|---|---|---|---|");
    for (const test of tests) {
      lines.push(`| \`${test.name}\` | \`${test.file}\` | ${test.behavior} | ${test.outcome} | ${(test.evidence ?? []).map((item) => `\`${item}\``).join(", ") || "—"} |`);
    }
    lines.push("", "Test descriptions/classification are agent-authored unless a parser is recorded as the source.");
  } else {
    lines.push("No added or modified tests recorded; this is not automatically a failure.");
  }

  lines.push("", "## Checks", "");
  const checks = report.checks ?? [];
  if (checks.length) {
    lines.push("| Command | Working directory | Result | Exit code | Evidence |", "|---|---|---|---:|---|");
    for (const check of checks) lines.push(`| \`${check.command}\` | \`${check.cwd ?? "unknown"}\` | ${check.outcome} | ${check.exitCode ?? "—"} | ${check.evidence ? `\`${check.evidence}\`` : "—"} |`);
  } else lines.push("No checks recorded.");

  lines.push("", "## Executed test commands", "");
  lines.push(...(report.executedTests?.length ? report.executedTests.map((check) => `- \`${check.command}\` — ${check.outcome}; exit ${check.exitCode ?? "unknown"}; evidence \`${check.evidence}\`.`) : ["No executed test commands recorded."]));
  lines.push("", "Command outcomes are not individual test results. Added/modified test inventory is listed separately.");
  lines.push("", "## Acceptance criteria", "");
  const criteria = (report.criteria ?? []) as Array<{ id?: string; status?: string; description?: string; evidence?: string[] }>;
  if (criteria.length) {
    lines.push("| ID | Status | Criterion | Evidence |", "|---|---|---|---|");
    for (const criterion of criteria) lines.push(`| ${criterion.id ?? "—"} | ${criterion.status ?? "unknown"} | ${criterion.description ?? "—"} | ${(criterion.evidence ?? []).join(", ") || "—"} |`);
  } else lines.push("No acceptance criteria recorded.");
  const gate = report.gate ?? {};
  lines.push("", "## Gate", "", `- **Verdict:** ${String(gate.verdict ?? report.verdict)}`, `- **Allowed:** ${String(gate.allowed ?? "unknown")}`);
  if (typeof gate.passing_criteria === "number" && typeof gate.total_criteria === "number") lines.push(`- **Criteria:** ${gate.passing_criteria}/${gate.total_criteria} passing`);
  const issues = Array.isArray(gate.issues) ? gate.issues : [];
  const sourceIssues = Array.isArray(gate.source_issues) ? gate.source_issues : [];
  lines.push(...[...issues, ...sourceIssues].map((issue) => `- **Issue:** ${String(issue)}`));
  lines.push("", "## Artifacts", "");
  const artifacts = report.artifacts ?? [];
  lines.push(...(artifacts.length ? artifacts.map((item) => `- **${item.label}:** \`${item.path}\``) : ["No artifacts recorded."]));
  lines.push("", "## Skipped checks", "", ...(report.skipped?.length ? report.skipped.map((item) => `- ${item}`) : ["- None recorded."]));
  lines.push("", "## Limitations", "", ...(report.limitations?.length ? report.limitations.map((item) => `- ${item}`) : ["- None recorded."]));
  lines.push("", "## Review provenance", "");
  if (report.review) {
    const records = report.review.records as { reviews?: unknown[] } | undefined;
    lines.push(`- **Kind:** ${String(report.review.kind ?? "unknown")}`, `- **Source:** ${String(report.review.source ?? "unknown")}`, `- **Reviews:** ${records?.reviews?.length ?? 0}`);
  } else lines.push("- Not recorded.");
  return lines.join("\n") + "\n";
}
