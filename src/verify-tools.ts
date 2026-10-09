import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
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

function projectKey(projectDir: string): string {
  const name = path.basename(projectDir) || "project";
  const suffix = createHash("sha1").update(projectDir).digest("hex").slice(0, 8);
  return `${name}-${suffix}`;
}

export type VerificationArtifact = { label: string; path: string; type: string; description?: string; sha256: string; size: number };

export type VerificationState = {
  projectDir: string;
  reportDir: string;
  attachments: VerificationArtifact[];
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

type ToolContext = { cwd?: string };
type Tool = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (toolCallId: string, params: any, signal: AbortSignal, onUpdate: unknown, ctx: ToolContext) => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }>;
};

function ensureCurrentState(state: VerificationLifecycleState, getCwd: () => string, ctx?: ToolContext): VerificationState {
  const projectDir = path.resolve(ctx?.cwd || getCwd());
  if (state.current) return state.current;
  const runId = `${new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID()}`;
  const reportDir = path.join(homedir(), ".pi", "agent", "verify", projectKey(projectDir), runId);
  const current: VerificationState = { projectDir, reportDir, attachments: [] };
  state.current = current;
  return current;
}

function deriveVerdict(checks: Array<{ outcome: string }> = []): string {
  if (!checks.length) return "UNKNOWN";
  if (checks.some((check) => check.outcome === "failed")) return checks.some((check) => check.outcome === "passed" || check.outcome === "skipped") ? "PARTIAL" : "FAILED";
  if (checks.every((check) => check.outcome === "passed" || check.outcome === "skipped")) return "VERIFIED";
  return "PARTIAL";
}

export function createVerificationTools(getCwd: () => string, state: VerificationLifecycleState): Tool[] {
  const attach: Tool = {
    name: "verify_attach",
    label: "Attach verification artifact",
    description: "Copy a screenshot, log, video, Playwright trace, or other existing file into the durable verification bundle.",
    parameters: schema({ path: { type: "string", description: "Existing artifact path" }, type: { type: "string", enum: ["screenshot", "log", "video", "playwright-trace", "file"] }, label: { type: "string" }, description: { type: "string" } }, ["path", "type", "label"]),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const current = ensureCurrentState(state, getCwd, ctx);
      const source = path.resolve(current.projectDir, params.path);
      const sourceStat = await stat(source);
      if (!sourceStat.isFile()) throw new Error(`Artifact is not a file: ${source}`);
      const bytes = await readFile(source);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const filename = `${randomUUID()}-${path.basename(source)}`;
      const destination = path.join(current.reportDir, "artifacts", filename);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
      const artifact = { label: params.label, path: destination, type: params.type, description: params.description, sha256: digest, size: sourceStat.size };
      current.attachments.push(artifact);
      return { content: text({ ...artifact, source }), details: { ...artifact, source, reportDir: current.reportDir } };
    },
  };

  const finish: Tool = {
    name: "verify_finish",
    label: "Finish verification",
    description: "Create the durable verification report from the task summary, checks, tests, and optional attachments.",
    parameters: schema({
      goal: { type: "string", description: "Short task description to record in the report" },
      changes: { type: "array", items: schema({ file: { type: "string" }, summary: { type: "string" } }, ["file", "summary"]) },
      tests: { type: "array", description: "Added or modified tests, separate from checks run.", items: schema({ name: { type: "string" }, file: { type: "string" }, behavior: { type: "string" }, outcome: { type: "string", enum: ["passed", "failed", "skipped", "unknown"] }, evidence: { type: "array", items: { type: "string" } } }, ["name", "file", "behavior", "outcome"]) },
      checks: { type: "array", description: "Concrete validation commands or inspections run for this task.", items: schema({ command: { type: "string" }, cwd: { type: "string" }, outcome: { type: "string", enum: ["passed", "failed", "skipped", "cancelled", "timed-out", "unknown"] }, exitCode: { type: "number" }, note: { type: "string" } }, ["command", "outcome"]) },
      skipped: { type: "array", items: { type: "string" } },
      limitations: { type: "array", items: { type: "string" } },
    }, ["goal"]),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const current = ensureCurrentState(state, getCwd, ctx);
      let source: Record<string, unknown> = { repository: current.projectDir, git: false, note: "No Git metadata was collected." };
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
      const checks = Array.isArray(params.checks) ? params.checks : [];
      const report: VerificationReport = {
        goal: params.goal,
        verdict: deriveVerdict(checks),
        source,
        commits,
        changes: params.changes ?? [],
        tests: (params.tests ?? []).map((item: Record<string, unknown>) => ({
          name: String(item.name ?? "unknown"),
          file: String(item.file ?? "unknown"),
          behavior: String(item.behavior ?? ""),
          outcome: (item.outcome as any) ?? "unknown",
          evidence: Array.isArray(item.evidence) ? item.evidence.map(String) : undefined,
          source: "agent-authored",
        })),
        checks: checks.map((item: Record<string, unknown>) => ({
          command: String(item.command ?? "unknown"),
          cwd: typeof item.cwd === "string" ? item.cwd : current.projectDir,
          outcome: (item.outcome as any) ?? "unknown",
          exitCode: typeof item.exitCode === "number" ? item.exitCode : undefined,
          note: typeof item.note === "string" ? item.note : undefined,
        })),
        artifacts: current.attachments,
        skipped: params.skipped ?? [],
        limitations: [...(params.limitations ?? []), ...sourceIssues],
      };
      const reportPaths = await writeReportBundle(path.join(current.reportDir, "reports"), report);
      const markdown = await readFile(reportPaths.markdownPath, "utf8");
      state.pendingReport = { markdown, ...reportPaths, auditDir: current.reportDir, verdict: report.verdict, allowed: report.verdict !== "FAILED" && report.verdict !== "PARTIAL" ? true : false };
      return { content: text({ verdict: report.verdict, allowed: state.pendingReport.allowed, reportPaths, reportDir: current.reportDir }), details: { verdict: report.verdict, allowed: state.pendingReport.allowed, reportPaths, reportDir: current.reportDir } };
    },
  };

  return [attach, finish];
}

export function registerVerificationTools(pi: { registerTool: (tool: Tool) => void }, getCwd: () => string, state: VerificationLifecycleState): void {
  for (const tool of createVerificationTools(getCwd, state)) pi.registerTool(tool);
}
