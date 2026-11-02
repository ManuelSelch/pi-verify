import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { emitPendingVerificationReport } from "../src/extension.js";
import { createVerificationTools, type VerificationLifecycleState } from "../src/verify-tools.js";

const exec = promisify(execFile);

export class ReviewHtmlDriver {
  private root = "";
  private state: VerificationLifecycleState = {};
  private html = "";
  private htmlPath = "";
  private goal = "Review a change";
  private readonly artifacts: Array<{ label: string; filename: string; type: string }> = [];

  private async call(name: string, params: unknown) {
    const tool = createVerificationTools(() => this.root, this.state).find((entry) => entry.name === name);
    assert.ok(tool);
    return tool.execute(name, params, new AbortController().signal, undefined, { cwd: this.root });
  }

  async prepareVerification(): Promise<void> {
    this.root = await mkdtemp(path.join(os.tmpdir(), "pi-review-html-"));
    await exec("git", ["init", "-b", "main"], { cwd: this.root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: this.root });
    await exec("git", ["config", "user.name", "Test"], { cwd: this.root });
    await writeFile(path.join(this.root, "source.txt"), "source\n");
    await exec("git", ["add", "source.txt"], { cwd: this.root });
    await exec("git", ["commit", "-m", "base"], { cwd: this.root });
    await exec("git", ["checkout", "-b", "feature"], { cwd: this.root });
    this.state.current = { projectDir: this.root, reportDir: path.join(this.root, ".git", "bundle"), attachments: [] };
  }

  private async attach(label: string, filename: string, type: string, content: string | Buffer): Promise<void> {
    const file = path.join(this.root, filename);
    await writeFile(file, content);
    await this.call("verify_attach", { path: file, type, label });
    this.artifacts.push({ label, filename, type });
  }

  async attachSelectedImageLogVideoAndOtherFile(): Promise<void> {
    await this.attach("Screenshot", "image.png", "screenshot", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z4sAAAAASUVORK5CYII=", "base64"));
    await this.attach("Log", "output.log", "log", "log output");
    await this.attach("Video", "video.webm", "video", "video fixture");
    await this.attach("Other", "other.html", "file", "<script>danger()</script>");
  }

  async includeUntrustedReportContent(): Promise<void> {
    this.goal = '<script>alert("goal")</script>';
    await this.attach('"><img src=x onerror=alert(1)>', 'bad # name.html', "file", "malicious file");
  }

  async finishVerification(): Promise<void> {
    const result = await this.call("verify_finish", {
      goal: this.goal,
      changes: [{ file: "source.txt", summary: "Agent reported change" }],
      checks: [{ command: "touch should-not-run", outcome: "passed" }],
      limitations: ["One check was not run"],
    });
    this.htmlPath = (result.details as { reportPaths: { htmlPath: string } }).reportPaths.htmlPath;
    assert.ok(this.htmlPath, "finish returns an HTML path");
    this.html = await readFile(this.htmlPath, "utf8");
  }

  async expectPortableHtmlAlongsideExistingOutputs(): Promise<void> {
    const pending = this.state.pendingReport!;
    assert.match(await readFile(pending.jsonPath, "utf8"), /schemaVersion/);
    assert.match(await readFile(pending.markdownPath, "utf8"), /Verification Report/);
    assert.match(this.html, /Review a change/);
    assert.equal(pending.htmlPath, this.htmlPath);
  }

  async expectOneMessageWithHtmlLink(): Promise<void> {
    const messages: Array<{ content: string; details: unknown; triggerTurn: boolean }> = [];
    const send = (message: { content: string; details: unknown }, options: { triggerTurn: boolean }) => messages.push({ ...message, triggerTurn: options.triggerTurn });
    assert.equal(emitPendingVerificationReport(this.state, send), true);
    assert.equal(emitPendingVerificationReport(this.state, send), false);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].triggerTurn, false);
    assert.match(messages[0].content, /\]\(file:\/\/[^)]*\.html\)/);
    assert.equal((messages[0].details as { htmlPath: string }).htmlPath, this.htmlPath);
  }

  async expectSectionsAndHonestUnavailableStates(): Promise<void> {
    for (const label of ["Overview", "Changes", "Tests &amp; coverage", "Complexity", "Architecture", "Evidence"]) assert.ok(this.html.includes(label), label);
    assert.match(this.html, /Agent reported change/);
    assert.match(this.html, /agent.reported/i);
    assert.match(this.html, /unavailable/i);
    assert.match(this.html, /One check was not run/);
  }

  async expectAccessibleResponsiveNavigation(): Promise<void> {
    assert.match(this.html, /<nav\b/);
    assert.match(this.html, /<main\b/);
    for (const id of ["overview", "changes", "tests-coverage", "complexity", "architecture", "evidence"]) {
      assert.match(this.html, new RegExp(`href="#${id}"`));
      assert.match(this.html, new RegExp(`id="${id}"`));
    }
    assert.match(this.html, /@media/);
    assert.match(this.html, /focus-visible/);
  }

  async expectSelectedEvidenceAndPortableLinks(): Promise<void> {
    const relocated = path.join(this.root, "relocated");
    await cp(this.state.current!.reportDir, relocated, { recursive: true });
    const reportDir = path.join(relocated, "reports");
    const paths = [...this.html.matchAll(/(?:href|src)="(\.\.\/artifacts\/[^"?#]+)"/g)].map((match) => decodeURIComponent(match[1]));
    for (const artifact of this.artifacts) {
      assert.ok(this.html.includes(artifact.label));
      const linked = paths.find((item) => item.endsWith(artifact.filename));
      assert.ok(linked, `${artifact.filename} is linked`);
      assert.ok((await stat(path.resolve(reportDir, linked))).isFile());
    }
    assert.match(this.html, /<img\b[^>]*src="\.\.\/artifacts\//);
    assert.doesNotMatch(this.html, /<(?:iframe|object|embed)\b/i);
    assert.match(this.html, /download/);
  }

  async expectUntrustedContentIsInert(): Promise<void> {
    assert.ok(this.html.includes('&lt;script&gt;alert(&quot;goal&quot;)&lt;/script&gt;'));
    assert.ok(this.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.doesNotMatch(this.html, /<script\b/i);
    assert.doesNotMatch(this.html, /<img src=x/);
    assert.match(this.html, /Content-Security-Policy/);
  }

  async expectNoNetworkAssetsOrMeasurementRuns(): Promise<void> {
    assert.doesNotMatch(this.html, /(?:src|href)="https?:/i);
    await assert.rejects(readFile(path.join(this.root, "should-not-run")));
  }

  async dispose(): Promise<void> { if (this.root) await rm(this.root, { recursive: true, force: true }); }
}
