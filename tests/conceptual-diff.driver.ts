import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectConceptualModel, type ConceptualReview } from "../src/conceptual-model/collect.js";
import { collectReviewReport } from "../src/review-report/infra/collect.js";
import { writeReportBundle } from "../src/report.js";

const drawing = (label: string, x: number) => `<mxGraphModel><root><object id="project" concept="Project" label="${label}"><mxCell vertex="1"><mxGeometry x="${x}" y="20" width="140" height="50"/></mxCell></object></root></mxGraphModel>`;

export class ConceptualDiffDriver {
  private readonly directory = mkdtempSync(path.join(os.tmpdir(), "project-diagram-"));
  private base = "";
  private target = "";
  private review!: ConceptualReview;
  private html = "";

  constructor() {
    this.git("init", "-q");
    this.git("config", "user.name", "Test");
    this.git("config", "user.email", "test@example.com");
  }

  dispose() { rmSync(this.directory, { recursive: true, force: true }); }

  private git(...args: string[]) {
    return execFileSync("git", args, { cwd: this.directory, encoding: "utf8" }).trim();
  }

  private write(file: string, content: string) {
    const destination = path.join(this.directory, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }

  private commit() {
    this.git("add", ".");
    this.git("commit", "-qm", "diagram revision");
    return this.git("rev-parse", "HEAD");
  }

  givenProjectDiagram() {
    this.write(".pi/pi-verify.json", JSON.stringify({ conceptualModel: { diagram: "frontend/docs/domain.drawio" } }));
    this.write("frontend/docs/domain.drawio", drawing("Project", 10));
    // An unrelated source file must not become an implicit code-conformance contract.
    this.write("src/review-report/domain/model.ts", "export interface Unsupported {} ");
    this.base = this.target = this.commit();
  }

  useConventionalDiagramWithoutConfiguration() {
    this.git("rm", ".pi/pi-verify.json");
    this.write("docs/conceptual-model.drawio", drawing("Project", 10));
    this.base = this.commit();
    this.write("docs/conceptual-model.drawio", drawing("Studio project", 10));
    this.target = this.commit();
  }

  removeDiagram() {
    this.git("rm", "frontend/docs/domain.drawio");
    this.target = this.commit();
  }

  changeLabel() {
    this.write("frontend/docs/domain.drawio", drawing("Studio project", 10));
    this.target = this.commit();
  }

  moveBox() {
    this.write("frontend/docs/domain.drawio", drawing("Project", 80));
    this.target = this.commit();
  }

  moveDiagram() {
    this.git("mv", "frontend/docs/domain.drawio", "frontend/docs/renamed.drawio");
    this.write(".pi/pi-verify.json", JSON.stringify({ conceptualModel: { diagram: "frontend/docs/renamed.drawio" } }));
    this.target = this.commit();
  }

  leaveUncommittedConfiguration() {
    this.write(".pi/pi-verify.json", "invalid loose JSON");
    this.write("frontend/docs/domain.drawio", "invalid loose XML");
  }

  configureInvalidPath() {
    this.write(".pi/pi-verify.json", JSON.stringify({ conceptualModel: { diagram: "../outside.drawio" } }));
    this.target = this.commit();
  }

  async compare() {
    this.review = (await collectConceptualModel(this.directory, this.base, this.target))!;
  }

  async generateVerifyReport() {
    const report = await collectReviewReport({ repository: this.directory, branch: "feature", head: this.target, baseline: this.base, baselineMethod: "branch-creation-reflog", fingerprint: "", clean: true, staged: [], unstaged: [], untracked: [], commits: [] }, []);
    assert.equal(report.sections.architecture.status, "available");
    assert.doesNotMatch(report.sections.architecture.scope, /review-report/);
    const bundle = await writeReportBundle(path.join(this.directory, "bundle"), { goal: "Project diagram", verdict: "UNKNOWN", review: report });
    this.html = readFileSync(bundle.htmlPath, "utf8");
    assert.match(readFileSync(path.join(this.directory, "bundle/conceptual-model.drawio"), "utf8"), /Studio project/);
  }

  generateStandaloneReport() {
    const cli = fileURLToPath(new URL("../src/conceptual-model/cli.js", import.meta.url));
    const output = JSON.parse(execFileSync(process.execPath, [cli, this.base, this.target, "standalone"], { cwd: this.directory, encoding: "utf8" }));
    assert.equal(output.guardrail.status, "unavailable");
    assert.deepEqual(output.delta.changed, ["concept Project"]);
    assert.match(readFileSync(output.report, "utf8"), /Studio project/);
  }

  thenLabelChangedWithoutCodeCheck() {
    assert.equal(this.review.basePresent, true);
    assert.equal(this.review.targetPresent, true);
    assert.deepEqual(this.review.delta, { added: [], removed: [], changed: ["concept Project"] });
    assert.equal(this.review.guardrail.status, "unavailable");
    assert.match(this.review.guardrail.diagnostics.join(" "), /not configured/i);
  }

  thenDiagramRemoved() {
    assert.equal(this.review.basePresent, true);
    assert.equal(this.review.targetPresent, false);
    assert.deepEqual(this.review.delta, { added: [], removed: ["concept Project"], changed: [] });
    assert.equal(this.review.guardrail.status, "unavailable");
  }

  thenNoSemanticChange() {
    assert.equal(this.review.basePresent, true);
    assert.equal(this.review.targetPresent, true);
    assert.deepEqual(this.review.delta, { added: [], removed: [], changed: [] });
  }

  thenReportExplainsUncheckedDiagram() {
    assert.match(this.html, /Studio project/);
    assert.match(this.html, /not configured/i);
    assert.doesNotMatch(this.html, /Guardrail passed/);
  }

  async thenInvalidConfigurationRejected() {
    await assert.rejects(() => this.compare(), /repository-relative/i);
  }
}
