import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { AgentAuditsRun, type GateResult } from "./agent-audits.js";
import { writeReportBundle, type VerificationReport } from "./report.js";
import { collectGitScope } from "./git-scope.js";

const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const text = (value: unknown): Array<{ type: "text"; text: string }> => [
  { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
];

type Evidence = { id: string; criterion_id: string; type: string; command?: string; exit_code?: number; artifact_path: string; summary?: string };
export type VerificationMatrixRow = {
  id: string;
  criterion?: string;
  description: string;
  expected: string;
  required?: boolean;
  evidence?: string[];
};

async function auditJson(current: VerificationState, file: string): Promise<any> {
  return JSON.parse(await readFile(path.join(current.auditDir, ".agent-audits", file), "utf8"));
}

function projectKey(projectDir: string): string {
  const name = path.basename(projectDir) || "project";
  const suffix = createHash("sha1").update(projectDir).digest("hex").slice(0, 8);
  return `${name}-${suffix}`;
}

export type VerificationState = {
  goal: string;
  projectDir: string;
  auditDir: string;
  audit: AgentAuditsRun;
  matrix?: VerificationMatrixRow[];
};

export type PendingVerificationReport = {
  markdown: string;
  jsonPath: string;
  markdownPath: string;
  auditDir: string;
  verdict: string;
  allowed: boolean;
  shown?: boolean;
};

export type VerificationLifecycleState = {
  current?: VerificationState;
  pendingReport?: PendingVerificationReport;
};

function matrixStatus(row: VerificationMatrixRow, evidence: Evidence[]): "passed" | "failed" | "not-run" {
  const linked = evidence.filter((item) => row.evidence?.includes(item.id));
  if (!linked.length) return "not-run";
  return linked.every((item) => item.exit_code === 0) ? "passed" : "failed";
}

type ToolContext = { cwd?: string };
type Tool = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (toolCallId: string, params: any, signal: AbortSignal, onUpdate: unknown, ctx: ToolContext) => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }>;
};

export function createVerificationTools(getCwd: () => string, state: VerificationLifecycleState): Tool[] {
  const start: Tool = {
    name: "verify_start",
    label: "Start verification",
    description: "Create an isolated durable Agent Audits run and generate task-specific acceptance criteria.",
    parameters: schema({ goal: { type: "string", description: "The task being verified" } }, ["goal"]),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const projectDir = path.resolve(ctx.cwd || getCwd());
      const runId = `${new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID()}`;
      const auditDir = path.join(homedir(), ".pi", "agent", "audits", projectKey(projectDir), runId);
      const audit = new AgentAuditsRun(projectDir, auditDir);
      await audit.init();
      await audit.plan(params.goal);
      const acceptance = JSON.parse(await readFile(path.join(auditDir, ".agent-audits", "acceptance.json"), "utf8"));
      state.current = { goal: params.goal, projectDir, auditDir, audit };
      return { content: text({ auditDir, acceptance }), details: { auditDir, acceptance } };
    },
  };

  const addMatrix: Tool = {
    name: "verify_add_matrix",
    label: "Add verification matrix",
    description: "Define the required behavior rows for verification. Link captured evidence later by passing matrix row IDs to verify_add_evidence.",
    parameters: schema({ rows: { type: "array", minItems: 1, items: schema({ id: { type: "string" }, criterion: { type: "string" }, description: { type: "string" }, expected: { type: "string" }, required: { type: "boolean" } }, ["id", "description", "expected"]) } }, ["rows"]),
    async execute(_id, params) {
      const current = state.current;
      if (!current) throw new Error("No verification run. Call verify_start first.");
      const rows = params.rows as VerificationMatrixRow[];
      if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("Verification matrix row IDs must be unique.");
      current.matrix = rows.map((row) => ({ ...row, required: row.required !== false, evidence: row.evidence ?? [] }));
      return { content: text({ rows: current.matrix }), details: { rows: current.matrix, auditDir: current.auditDir } };
    },
  };

  const addEvidence: Tool = {
    name: "verify_add_evidence",
    label: "Add verification evidence",
    description: "Run an arbitrary command in the source project and attach its real output and exit code to Agent Audits. Demo version intentionally has no command allowlist or approval step.",
    parameters: schema({ criterion: { type: "string", description: "Acceptance criterion ID, e.g. AC-001" }, type: { type: "string", description: "Agent Audits evidence type" }, command: { type: "string", description: "Command to execute" }, summary: { type: "string", description: "Short description of the evidence" }, matrixRows: { type: "array", items: { type: "string" }, description: "Verification matrix row IDs covered by this evidence" } }, ["criterion", "type", "command"]),
    async execute(_id, params) {
      const current = state.current;
      if (!current) throw new Error("No verification run. Call verify_start first.");
      const evidence = await current.audit.addCommandEvidence(params.criterion, params.type, params.command, { summary: params.summary });
      const index = await auditJson(current, "evidence/index.json");
      const entry = (index.evidence as Evidence[]).find((item) => item.id === evidence)!;
      const artifactPath = path.resolve(current.auditDir, entry.artifact_path);
      const output = await readFile(artifactPath, "utf8");
      const matrixRows = (params.matrixRows ?? []) as string[];
      for (const rowId of matrixRows) {
        const row = current.matrix?.find((item) => item.id === rowId);
        if (!row) throw new Error(`Unknown verification matrix row: ${rowId}`);
        row.evidence ??= [];
        if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
      }
      const result = { evidence, command: params.command, exitCode: entry.exit_code, artifactPath, output: output.slice(0, 16000), truncated: output.length > 16000, matrixRows, auditDir: current.auditDir };
      return { content: text(result), details: result };
    },
  };

  const review: Tool = {
    name: "verify_review",
    label: "Review verification evidence",
    description: "Record an explicit self-review against an acceptance criterion. Inspect the captured output/artifact first; success alone does not prove the criterion.",
    parameters: schema({ criterion: { type: "string" }, evidence: { type: "string" }, verdict: { type: "string", enum: ["supports", "does-not-support", "unclear"] }, notes: { type: "string", minLength: 1 } }, ["criterion", "evidence", "verdict", "notes"]),
    async execute(_id, params) {
      const current = state.current;
      if (!current) throw new Error("No verification run. Call verify_start first.");
      await current.audit.review(params.criterion, params.evidence, params.verdict, params.notes);
      const result = { ...params, kind: "self-review", auditDir: current.auditDir };
      return { content: text(result), details: result };
    },
  };

  const finish: Tool = {
    name: "verify_finish",
    label: "Finish verification",
    description: "Run the Agent Audits gate and create the durable pi-verify JSON and Markdown reports.",
    parameters: schema({
      changes: { type: "array", items: schema({ file: { type: "string" }, summary: { type: "string" } }, ["file", "summary"]) },
      tests: { type: "array", description: "Agent-authored added/modified tests, not executed commands. Use unknown unless named runner output supports an outcome.", items: schema({ name: { type: "string" }, file: { type: "string" }, behavior: { type: "string" }, outcome: { type: "string", enum: ["passed", "failed", "skipped", "unknown"] }, evidence: { type: "array", items: { type: "string" } } }, ["name", "file", "behavior", "outcome"]) },
      skipped: { type: "array", items: { type: "string" } },
      limitations: { type: "array", items: { type: "string" } },
    }),
    async execute(_id, params) {
      const current = state.current;
      if (!current) throw new Error("No verification run. Call verify_start first.");
      const agentGate: GateResult = await current.audit.check();
      let source: Record<string, unknown>;
      let commits: VerificationReport["commits"] = [];
      const sourceIssues: string[] = [];
      try {
        const git = await collectGitScope(current.projectDir);
        commits = git.commits;
        source = {
          repository: git.repository,
          branch: git.branch,
          baseline: git.baseline ?? "unknown",
          baselineMethod: git.baselineMethod,
          head: git.head,
          fingerprint: git.fingerprint,
          clean: git.clean,
          staged: git.staged,
          unstaged: git.unstaged,
          untracked: git.untracked,
        };
        if (git.untracked.length) sourceIssues.push(`Untracked files exist: ${git.untracked.join(", ")}`);
        if (git.baselineMethod === "unknown") sourceIssues.push("The task baseline could not be detected, so created commits may be incomplete.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        source = { repository: current.projectDir, git: false, error: message };
        sourceIssues.push("Git source state and untracked files could not be verified.");
      }
      const sourceBlocks = sourceIssues.some((issue) => issue.startsWith("Untracked") || issue.startsWith("Git source"));
      const agentReport = await current.audit.report();
      const acceptance = await auditJson(current, "acceptance.json");
      const index = await auditJson(current, "evidence/index.json");
      const matrix = (current.matrix ?? []).map((row) => ({ ...row, required: row.required !== false, status: matrixStatus(row, index.evidence as Evidence[]) }));
      const matrixIssues = matrix.filter((row) => row.required && row.status !== "passed").map((row) => `${row.id} is ${row.status}.`);
      const matrixBlocks = matrixIssues.length > 0;
      const allowed = agentGate.allowed && !sourceBlocks && !matrixBlocks;
      const verdict = sourceBlocks || matrixBlocks ? "NOT VERIFIED" : agentGate.verdict;
      const gate: GateResult = { ...agentGate, agent_audits_verdict: agentGate.verdict, verdict, allowed, source_issues: sourceIssues, matrix_issues: matrixIssues };
      const reviews = await auditJson(current, "reviews.json");
      const checks = (index.evidence as Evidence[]).map((item) => ({
        command: item.command ?? "Not recorded",
        cwd: current.projectDir,
        outcome: item.exit_code === undefined ? "unknown" as const : item.exit_code === 0 ? "passed" as const : "failed" as const,
        exitCode: item.exit_code,
        evidence: item.id,
        note: item.summary,
      }));
      const report: VerificationReport = {
        goal: current.goal,
        verdict,
        source,
        commits,
        changes: params.changes ?? [],
        tests: (params.tests ?? []).map((item: object) => ({ ...item, source: "agent-authored" })),
        checks,
        executedTests: checks.filter((check) => (index.evidence as Evidence[]).some((item) => item.id === check.evidence && item.type === "test")),
        criteria: acceptance.criteria,
        evidence: index.evidence,
        matrix,
        gate,
        artifacts: [{ label: "Agent Audits report", path: agentReport }, ...["acceptance.json", "evidence/index.json", "reviews.json"].map((file) => ({ label: file, path: path.join(current.auditDir, ".agent-audits", file) })), ...(index.evidence as Evidence[]).map((item) => ({ label: item.id, path: path.resolve(current.auditDir, item.artifact_path) }))],
        skipped: params.skipped ?? [],
        limitations: ["Command execution is unrestricted in this demo.", "Change summaries and test inventory are agent-authored.", ...sourceIssues, ...params.limitations ?? []],
        review: { kind: "self-review", source: "Agent Audits", allowed: gate.allowed, processExitCode: gate.process_exit_code, records: reviews },
      };
      const reportPaths = await writeReportBundle(path.join(current.auditDir, ".agent-audits", "reports"), report);
      const markdown = await readFile(reportPaths.markdownPath, "utf8");
      state.pendingReport = { markdown, ...reportPaths, auditDir: current.auditDir, verdict, allowed };
      return { content: text({ verdict, allowed, source, commits, reportPaths, auditDir: current.auditDir }), details: { verdict, allowed, gate, source, commits, reportPaths, auditDir: current.auditDir } };
    },
  };

  return [start, addMatrix, addEvidence, review, finish];
}

export function registerVerificationTools(pi: { registerTool: (tool: Tool) => void }, getCwd: () => string, state: VerificationLifecycleState): void {
  for (const tool of createVerificationTools(getCwd, state)) pi.registerTool(tool);
}
