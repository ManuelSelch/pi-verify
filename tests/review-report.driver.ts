import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { emitPendingVerificationReport } from "../src/extension.js";
import { createVerificationTools, type VerificationLifecycleState } from "../src/verify-tools.js";

const exec = promisify(execFile);

export class ReviewReportDriver {
  private root = "";
  private container = "";
  private base = "";
  private target = "";
  private state: VerificationLifecycleState = {};
  private report: any;
  private historical = "";
  private async git(...args: string[]): Promise<string> {
    return (await exec("git", args, { cwd: this.root })).stdout.trim();
  }
  private async call(name: string, params: unknown): Promise<any> {
    const tool = createVerificationTools(() => this.root, this.state).find((item) => item.name === name);
    assert.ok(tool);
    return tool.execute(name, params, new AbortController().signal, undefined, { cwd: this.root });
  }
  async startRepository(): Promise<void> {
    this.container = await mkdtemp(path.join(os.tmpdir(), "pi-review-scenario-"));
    this.root = this.container;
    await this.git("init", "-b", "main");
    await this.git("config", "user.email", "test@example.com");
    await this.git("config", "user.name", "Test");
    await writeFile(path.join(this.root, "source.txt"), "base\n");
    await this.git("add", "source.txt");
    await this.git("commit", "-m", "base");
    this.base = await this.git("rev-parse", "HEAD");
    const worktree = `${this.container}-worktree`;
    await this.git("worktree", "add", "-b", "feature", worktree);
    this.root = worktree;
    this.state.current = { projectDir: this.root, reportDir: path.join(this.container, ".git", "report"), attachments: [] };
  }
  async createCommittedChange(): Promise<void> {
    await writeFile(path.join(this.root, "source.txt"), "committed\n");
    await this.git("add", "source.txt");
    await this.git("commit", "-m", "feature");
    this.target = await this.git("rev-parse", "HEAD");
  }
  async createWorkingTreeChanges(): Promise<void> {
    await writeFile(path.join(this.root, "source.txt"), "staged\n");
    await this.git("add", "source.txt");
    await writeFile(path.join(this.root, "source.txt"), "unstaged\n");
    await writeFile(path.join(this.root, "untracked.txt"), "untracked\n");
  }
  async configureAmbiguousBases(): Promise<void> { await this.git("reflog", "expire", "--expire=now", "--all"); }
  async selectCommittedComparison(): Promise<void> { assert.ok(this.base && this.target); }
  async attachEvidence(): Promise<void> {
    const file = path.join(this.container, ".git", "evidence.log");
    await writeFile(file, "selected evidence");
    await this.call("verify_attach", { path: file, type: "log", label: "Evidence" });
  }
  async finishWithAgentReportedCheck(): Promise<void> {
    const result = await this.call("verify_finish", { goal: "Review feature", tests: [{ name: "example", file: "example.test.ts", behavior: "example", outcome: "unknown" }], checks: [{ command: "touch should-not-run", outcome: "passed" }] });
    this.report = JSON.parse(await readFile(result.details.reportPaths.jsonPath, "utf8"));
  }
  async interruptVerification(): Promise<void> { /* No finish call occurs when interrupted. */ }
  async finishWithoutSelectingBase(): Promise<void> { await this.finishWithAgentReportedCheck(); }
  async expectVersionedProvenanceAndUnavailableAnalysis(): Promise<void> {
    assert.equal(this.report.review.schemaVersion, 1);
    assert.equal(this.report.review.sections.overview.source, "agent-authored");
    for (const key of ["testsCoverage", "complexity", "architecture"]) assert.equal(this.report.review.sections[key].status, "unavailable");
    assert.equal(this.report.tests[0].outcome, "unknown");
  }
  async expectCommittedRevisionsAndExcludedWorkingTree(): Promise<void> {
    const comparison = this.report.review.comparison;
    assert.equal(comparison.base, this.base);
    assert.equal(comparison.target, this.target);
    assert.equal(comparison.targetTree, await this.git("rev-parse", "HEAD^{tree}"));
    assert.equal(comparison.includesUncommitted, false);
    assert.deepEqual(comparison.excludedWorkingTree, { staged: ["source.txt"], unstaged: ["source.txt"], untracked: ["untracked.txt"] });
  }
  async expectAmbiguousBaseReported(): Promise<void> {
    assert.equal(this.report.review.comparison.status, "unavailable");
    assert.equal(this.report.review.comparison.base, null);
  }
  async expectExistingOutputsAndEvidencePreserved(): Promise<void> {
    assert.equal(this.report.schemaVersion, 1);
    assert.equal(this.report.goal, "Review feature");
    assert.equal(this.report.checks[0].outcome, "passed");
    assert.match(await readFile(this.state.pendingReport!.markdownPath, "utf8"), /Verification Report/);
    if (this.state.current!.attachments.length) assert.equal(this.report.artifacts[0].label, "Evidence");
  }
  async expectNoMeasurementCommandsRun(): Promise<void> {
    await assert.rejects(readFile(path.join(this.root, "should-not-run")));
  }
  async expectInterruptedRunDoesNotEmitReport(): Promise<void> {
    let count = 0;
    assert.equal(emitPendingVerificationReport(this.state, () => count++), false);
    assert.equal(count, 0);
  }
  async expectOneReportMessage(): Promise<void> {
    let count = 0;
    let triggerTurn: boolean | undefined;
    const send = (_message: unknown, options: { triggerTurn: boolean }) => { count++; triggerTurn = options.triggerTurn; };
    assert.equal(emitPendingVerificationReport(this.state, send), true);
    assert.equal(emitPendingVerificationReport(this.state, send), false);
    assert.equal(count, 1);
    assert.equal(triggerTurn, false);
  }
  async createHistoricBundle(): Promise<void> {
    this.historical = path.join(this.container, ".git", "historic.json");
    await writeFile(this.historical, '{"schemaVersion":1}\n');
  }
  async expectHistoricBundleUnchanged(): Promise<void> { assert.equal(await readFile(this.historical, "utf8"), '{"schemaVersion":1}\n'); }
  async dispose(): Promise<void> {
    if (this.root && this.root !== this.container) await rm(this.root, { recursive: true, force: true });
    if (this.container) await rm(this.container, { recursive: true, force: true });
  }
}
