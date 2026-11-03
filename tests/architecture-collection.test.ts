import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectArchitecture } from "../src/architecture/collect.js";
import { collectReviewReport } from "../src/review-report/infra/collect.js";
import { writeReportBundle } from "../src/report.js";

function drawing(slices: string[], edges: string[]): string {
  const boxes = slices.map(slice => `<object id="box-${slice}" concept="${slice}" label="${slice}"><mxCell vertex="1"><mxGeometry x="0" y="0" width="140" height="50"/></mxCell></object>`).join("");
  const arrows = edges.map(edge => {
    const [from, to] = edge.split("->");
    return `<object id="edge-${from}-${to}" assoc="${from}->${to}"><mxCell edge="1" source="box-${from}" target="box-${to}"/></object>`;
  }).join("");
  return `<mxfile><diagram><mxGraphModel><root>${boxes}${arrows}</root></mxGraphModel></diagram></mxfile>`;
}

function repository(t: TestContext): { dir: string; git: (...args: string[]) => string; write: (file: string, content: string) => void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "architecture-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  const write = (file: string, content: string) => {
    const destination = path.join(dir, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  };
  write("seed", "seed"); git("add", "."); git("commit", "-qm", "base");
  return { dir, git, write };
}

test("collects committed architecture and checks import direction between folders", async (t) => {
  const { dir, git, write } = repository(t);
  const base = git("rev-parse", "HEAD");
  write(".pi/pi-verify.json", JSON.stringify({ architecture: { diagram: "docs/architecture.drawio", root: "src" } }));
  write("docs/architecture.drawio", drawing(["domain", "infra", "report", "ui"], ["domain->infra", "report->domain", "ui->report"]));
  write("src/domain/model.ts", `import { table } from "../infra/db"; export const owners = table("owners");`);
  write("src/infra/db.ts", `export function table(name: string) { return name; }`);
  write("src/report/report.ts", `import { owners } from "../domain/model"; export const report = owners;`);
  write("src/ui/page.ts", `import { report } from "../report/report"; export const page = report;`);
  git("add", "."); git("commit", "-qm", "architecture");
  const target = git("rev-parse", "HEAD");

  const review = await collectArchitecture(dir, base, target);
  assert.ok(review);
  assert.equal(review.basePresent, false);
  assert.equal(review.targetPresent, true);
  assert.equal(review.guardrail.status, "passed");
  assert.deepEqual(review.guardrail.diagnostics, []);
  assert.deepEqual(review.delta?.added, ["association domain->infra", "association report->domain", "association ui->report", "slice domain", "slice infra", "slice report", "slice ui"]);

  const report = await collectReviewReport({ repository: dir, branch: "feature", head: target, baseline: base, baselineMethod: "branch-creation-reflog", fingerprint: "", clean: true, staged: [], unstaged: [], untracked: [], commits: [] }, []);
  assert.ok(report.architecture);
  assert.equal(report.sections.architecture.status, "available");
  const bundle = await writeReportBundle(path.join(dir, "bundle"), { goal: "Architecture", verdict: "UNKNOWN", review: report });
  const html = readFileSync(bundle.htmlPath, "utf8");
  assert.match(html, /Architecture/);
  assert.match(html, /Architecture guardrail passed/);
  assert.match(readFileSync(path.join(dir, "bundle/architecture.drawio"), "utf8"), /concept="domain"/);
});

test("reports an undeclared dependency without failing collection", async (t) => {
  const { dir, git, write } = repository(t);
  const base = git("rev-parse", "HEAD");
  write(".pi/pi-verify.json", JSON.stringify({ architecture: { diagram: "docs/architecture.drawio", root: "src" } }));
  write("docs/architecture.drawio", drawing(["domain", "infra"], ["report->domain"]));
  write("src/domain/model.ts", `import { table } from "../infra/db"; export const owners = table("owners");`);
  write("src/infra/db.ts", `export function table(name: string) { return name; }`);
  git("add", "."); git("commit", "-qm", "architecture");
  const target = git("rev-parse", "HEAD");

  const review = await collectArchitecture(dir, base, target);
  assert.equal(review?.guardrail.status, "failed");
  assert.match(review?.guardrail.diagnostics.join(" ") ?? "", /undeclared association domain->infra/);
});

test("a project without architecture configuration yields no architecture review", async (t) => {
  const { dir, git, write } = repository(t);
  const base = git("rev-parse", "HEAD");
  write("src/thing.ts", `export const thing = 1;`);
  git("add", "."); git("commit", "-qm", "code");
  const target = git("rev-parse", "HEAD");
  assert.equal(await collectArchitecture(dir, base, target), null);
});
