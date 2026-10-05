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
  outcome: Outcome;
  exitCode?: number;
  evidence?: string;
  note?: string;
};

export type VerificationReport = {
  goal: string;
  verdict: string;
  source?: Record<string, string>;
  changes?: Array<{ file: string; summary: string }>;
  tests?: TestEntry[];
  checks?: CheckEntry[];
  artifacts?: Array<{ label: string; path: string }>;
  skipped?: string[];
  limitations?: string[];
  review?: Record<string, unknown>;
};

export function reportJson(report: VerificationReport): string {
  return JSON.stringify({ schemaVersion: 1, ...report }, null, 2) + "\n";
}

export function reportMarkdown(report: VerificationReport): string {
  const lines = ["# Verification Report", "", `**Verdict:** \`${report.verdict}\``, `**Goal:** ${report.goal}`, "", "## Source", ""];
  const source = report.source ?? {};
  lines.push(...(Object.keys(source).length ? Object.entries(source).map(([key, value]) => `- **${key}:** ${value}`) : ["- Not recorded"]));

  lines.push("", "## Changes", "");
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
    lines.push("| Command | Result | Exit code | Evidence |", "|---|---|---:|---|");
    for (const check of checks) lines.push(`| \`${check.command}\` | ${check.outcome} | ${check.exitCode ?? "—"} | ${check.evidence ? `\`${check.evidence}\`` : "—"} |`);
  } else lines.push("No checks recorded.");

  lines.push("", "## Artifacts", "");
  const artifacts = report.artifacts ?? [];
  lines.push(...(artifacts.length ? artifacts.map((item) => `- **${item.label}:** \`${item.path}\``) : ["No artifacts recorded."]));
  lines.push("", "## Skipped checks", "", ...(report.skipped?.length ? report.skipped.map((item) => `- ${item}`) : ["- None recorded."]));
  lines.push("", "## Limitations", "", ...(report.limitations?.length ? report.limitations.map((item) => `- ${item}`) : ["- None recorded."]));
  lines.push("", "## Review provenance", "", `- ${report.review ? JSON.stringify(report.review) : "Not recorded."}`);
  return lines.join("\n") + "\n";
}
