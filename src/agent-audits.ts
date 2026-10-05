import { execFile } from "node:child_process";
import { access, mkdir, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export class AgentAuditsError extends Error {}

export type GateResult = {
  verdict: string;
  allowed: boolean;
  [key: string]: unknown;
};

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export class AgentAuditsRun {
  readonly source: string;
  readonly runDir: string;
  private readonly executable: string;

  constructor(source: string, runDir: string, executable = "agent-audits") {
    this.source = path.resolve(source);
    this.runDir = path.resolve(runDir);
    this.executable = executable;
  }

  private async cli(args: string[], allowFailure = false): Promise<{ stdout: string; stderr: string; code: number }> {
    try {
      const result = await execFileAsync(this.executable, args, {
        cwd: this.runDir,
        env: { ...process.env, PI_VERIFY_SOURCE: this.source },
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout: result.stdout, stderr: result.stderr, code: 0 };
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; code?: number };
      const result = {
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? "",
        code: typeof failure.code === "number" ? failure.code : 1,
      };
      if (allowFailure) return result;
      throw new AgentAuditsError(`${this.executable} ${args.join(" ")} failed (${result.code}): ${result.stderr || result.stdout}`);
    }
  }

  async init(): Promise<void> {
    await access(this.source, constants.R_OK);
    await mkdir(this.runDir, { recursive: true });
    await this.cli(["init"]);
  }

  async plan(goal: string): Promise<void> {
    await this.cli(["plan", goal]);
  }

  async addCommandEvidence(
    criterion: string,
    type: string,
    command: string,
    options: { summary?: string; expectedExitCode?: number } = {},
  ): Promise<string> {
    const sourceCommand = `cd ${shellQuote(this.source)} && ${command}`;
    const args = ["add-evidence", "--criterion", criterion, "--type", type, "--command", sourceCommand];
    if (options.summary) args.push("--summary", options.summary);
    if (options.expectedExitCode !== undefined) args.push("--exit-code", String(options.expectedExitCode));
    const result = await this.cli(args);
    const match = result.stdout.match(/EV-\d+/);
    if (!match) throw new AgentAuditsError(`No evidence ID returned: ${result.stdout}`);
    return match[0];
  }

  async review(criterion: string, evidence: string, verdict: string, notes: string): Promise<void> {
    await this.cli(["review", "--criterion", criterion, "--evidence", evidence, "--verdict", verdict, "--notes", notes]);
  }

  async check(): Promise<GateResult> {
    const result = await this.cli(["check", "--json"], true);
    try {
      return { ...(JSON.parse(result.stdout) as GateResult), process_exit_code: result.code };
    } catch {
      throw new AgentAuditsError(`Invalid JSON from agent-audits check: ${result.stdout}`);
    }
  }

  async report(): Promise<string> {
    await this.cli(["report"]);
    const reportsDir = path.join(this.runDir, ".agent-audits", "reports");
    const files = (await readdir(reportsDir)).filter((file) => file.endsWith(".md")).sort();
    if (!files.length) throw new AgentAuditsError("Agent Audits did not create a Markdown report");
    return path.join(reportsDir, files.at(-1)!);
  }
}
