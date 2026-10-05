import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { AgentAuditsRun, type GateResult } from "./agent-audits.js";
import { writeReportBundle, type VerificationReport } from "./report.js";

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

export type VerificationState = {
  goal: string;
  projectDir: string;
  auditDir: string;
  audit: AgentAuditsRun;
};

type ToolContext = { cwd?: string };
type Tool = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (toolCallId: string, params: any, signal: AbortSignal, onUpdate: unknown, ctx: ToolContext) => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }>;
};

export function createVerificationTools(getCwd: () => string, state: { current?: VerificationState }): Tool[] {
  const start: Tool = {
    name: "verify_start",
    label: "Start verification",
    description: "Create an isolated durable Agent Audits run and generate task-specific acceptance criteria.",
    parameters: schema({ goal: { type: "string", description: "The task being verified" } }, ["goal"]),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const projectDir = path.resolve(ctx.cwd || getCwd());
      const runId = `${new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14)}-${process.pid}`;
      const auditDir = path.join(homedir(), ".pi", "agent", "audits", projectKey(projectDir), runId);
      const audit = new AgentAuditsRun(projectDir, auditDir);
      await audit.init();
      await audit.plan(params.goal);
      const acceptance = JSON.parse(await readFile(path.join(auditDir, ".agent-audits", "acceptance.json"), "utf8"));
      state.current = { goal: params.goal, projectDir, auditDir, audit };
      return { content: text({ auditDir, acceptance }), details: { auditDir, acceptance } };
    },
  };

  const addEvidence: Tool = {
    name: "verify_add_evidence",
    label: "Add verification evidence",
    description: "Run an arbitrary command in the source project and attach its real output and exit code to Agent Audits. Demo version intentionally has no command allowlist or approval step.",
    parameters: schema({ criterion: { type: "string", description: "Acceptance criterion ID, e.g. AC-001" }, type: { type: "string", description: "Agent Audits evidence type" }, command: { type: "string", description: "Command to execute" }, summary: { type: "string", description: "Short description of the evidence" } }, ["criterion", "type", "command"]),
    async execute(_id, params) {
      const current = state.current;
      if (!current) throw new Error("No verification run. Call verify_start first.");
      const evidence = await current.audit.addCommandEvidence(params.criterion, params.type, params.command, { summary: params.summary });
      return { content: text({ evidence, command: params.command, auditDir: current.auditDir }), details: { evidence, command: params.command, auditDir: current.auditDir } };
    },
  };

  const finish: Tool = {
    name: "verify_finish",
    label: "Finish verification",
    description: "Run the Agent Audits gate and create the durable pi-verify JSON and Markdown reports.",
    parameters: schema({}, []),
    async execute() {
      const current = state.current;
      if (!current) throw new Error("No verification run. Call verify_start first.");
      const gate: GateResult = await current.audit.check();
      const agentReport = await current.audit.report();
      const report: VerificationReport = {
        goal: current.goal,
        verdict: gate.verdict,
        source: { project: current.projectDir },
        artifacts: [{ label: "Agent Audits report", path: agentReport }],
        limitations: ["Command execution is unrestricted in this demo.", "Test inventory collection is not automated yet."],
        review: { source: "Agent Audits", allowed: gate.allowed, processExitCode: gate.process_exit_code },
      };
      const reportPaths = await writeReportBundle(path.join(current.auditDir, ".agent-audits", "reports"), report);
      return { content: text({ verdict: gate.verdict, allowed: gate.allowed, reportPaths, auditDir: current.auditDir }), details: { gate, reportPaths, auditDir: current.auditDir } };
    },
  };

  return [start, addEvidence, finish];
}

export function registerVerificationTools(pi: { registerTool: (tool: Tool) => void }, getCwd: () => string, state: { current?: VerificationState }): void {
  for (const tool of createVerificationTools(getCwd, state)) pi.registerTool(tool);
}
