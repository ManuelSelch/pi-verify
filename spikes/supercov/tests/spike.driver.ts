import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Fixture } from "./fixture.ts";
import { measure, buildReport, type Measurement } from "../src/collector.ts";
import { writeReport } from "../src/report.ts";
import type { Report } from "../src/model.ts";

export class SupercovSpikeDriver {
  fixture = new Fixture();
  measurement!: Measurement;
  report!: Report;
  outputDirectory = "";
  async dispose(): Promise<void> { await this.fixture.dispose(); }
  async prepareTypeScriptFixture(): Promise<void> { await this.fixture.prepare(); }
  async prepareCompiledTypeScriptFixture(): Promise<void> { await this.fixture.prepare("compiled"); }
  async prepareFixtureWithCommittedBaseAndWorkingTreeChanges(): Promise<void> { await this.fixture.prepare(); }
  async prepareOverlappingTestsWithSetup(): Promise<void> { await this.fixture.prepare("overlap"); }
  async prepareFailingTest(): Promise<void> { await this.fixture.prepare("failure"); }
  async measureWithSupercov(): Promise<void> {
    this.outputDirectory = path.join(this.fixture.directory, "artifacts");
    this.measurement = await measure({ root: this.fixture.directory, base: "HEAD", sourceFiles: ["src/pricing.ts"], testFiles: ["tests/pricing.test.ts"], outputDirectory: this.outputDirectory });
    this.report = await buildReport(this.measurement);
  }
  async expectDistinctTestIdentitiesAndOutcomes(): Promise<void> {
    assert.equal(this.report.tests.length, 3);
    assert.equal(new Set(this.report.tests.map(item => item.id)).size, 3);
    assert.deepEqual(this.report.tests.map(item => item.outcome), ["passed", "passed", "passed"]);
    assert.equal(this.report.run.exitCode, 0);
    assert.ok(this.report.tests.every(item => item.source?.startsWith("test(")));
    assert.equal(this.report.stale, false);
  }
  async expectEachTestCoversItsOwnBranchNotTheOther(): Promise<void> {
    const member = this.report.tests.find(item => item.name === "applies a member discount")!;
    const regular = this.report.tests.find(item => item.name === "keeps the regular price")!;
    assert.equal(member.attribution, "exact");
    assert.ok(member.executedLines.some(item => item.file === "src/pricing.ts" && item.line === 4));
    assert.ok(!member.executedLines.some(item => item.line === 9));
    assert.ok(regular.executedLines.some(item => item.line === 9));
    assert.ok(!regular.executedLines.some(item => item.line === 4));
    assert.ok(this.report.sources["src/pricing.ts"].source.includes("total: number"));
  }
  async generateReport(): Promise<void> {
    this.report = await buildReport(this.measurement);
    await writeReport(this.report, this.outputDirectory);
  }
  async expectAddedAndModifiedTestsSeparateFromCoveringTests(): Promise<void> {
    assert.deepEqual(this.report.tests.filter(item => item.change !== "unchanged").map(item => [item.name, item.change]), [
      ["keeps the regular price", "modified"], ["rejects a negative price", "added"],
    ]);
    assert.deepEqual(this.report.tests.filter(item => item.changedHits.length).map(item => item.name), ["applies a member discount"]);
    const regular = this.report.tests.find(item => item.change === "modified")!;
    assert.ok(regular.diff.some(item => item.kind === "removed" && item.text.includes("price(100, false)")));
    assert.ok(regular.diff.some(item => item.kind === "added" && item.text.includes("price(200, false)")));
    assert.ok(this.report.tests.find(item => item.change === "added")!.diff.every(item => item.kind === "added"));
  }
  async expectUnchangedTestCoveringChangedCodeIncluded(): Promise<void> {
    const member = this.report.tests.find(item => item.name === "applies a member discount")!;
    assert.equal(member.change, "unchanged");
    assert.deepEqual(member.changedHits, [{ file: "src/pricing.ts", line: 4 }]);
    const changed = this.report.changedLines.find(item => item.line === 4)!;
    assert.equal(changed.status, "covered");
    assert.deepEqual(changed.coveringTests, [member.id]);
  }
  async expectUncoveredChangedExecutableLineVisible(): Promise<void> {
    const gap = this.report.changedLines.find(item => item.file === "src/pricing.ts" && item.line === 7)!;
    assert.equal(gap.status, "uncovered");
    assert.equal(gap.context.startLine, 1);
    assert.equal(gap.context.endLine, 10);
    assert.ok(gap.context.source.includes("return total * 0.8"));
    assert.ok(gap.context.source.includes("return total - 25"));
  }
  async expectPortableHtmlAndNeutralJson(): Promise<void> {
    const html = await readFile(path.join(this.outputDirectory, "index.html"), "utf8");
    const json = JSON.parse(await readFile(path.join(this.outputDirectory, "report.json"), "utf8"));
    assert.equal(json.schemaVersion, 1);
    assert.equal(json.collector.name, "Supercov");
    assert.equal(json.tests.length, 3);
    assert.equal(json.stale, false);
    assert.match(html, /All tests/);
    assert.match(html, /Changed tests/);
    assert.match(html, /Covering changes/);
    assert.match(html, /Show changed-code hits/);
    assert.match(html, /data-line="4" class="context-hit"/);
    assert.match(html, /data-line="1" class=""/);
    assert.match(html, /data-line="7" class="context-gap"/);
    assert.match(html, /price\(200, false\)/);
    assert.ok(!/<details[^>]*\sopen(?:\s|>)/.test(html), "all disclosures begin collapsed");
    assert.ok(!/<(?:script|link|img)[^>]*(?:src|href)=/.test(html), "no external assets");
    assert.ok(!html.includes(this.fixture.directory), "portable report has no temporary absolute paths");
  }
  async expectExactDisjointAttributionOrExplicitUnsupported(): Promise<void> {
    assert.equal(this.report.tests.length, 2);
    for (const [name, own, other] of [["alpha branch", 17, 21], ["beta branch", 21, 17]] as const) {
      const item = this.report.tests.find(item => item.name.endsWith(name))!;
      if (item.attribution !== "exact") {
        assert.equal(item.changedHits.length, 0);
        assert.ok(this.report.limitations.some(line => line.includes(item.name)));
        continue;
      }
      assert.ok(item.executedLines.some(line => line.line === own), `${name} must execute its own branch`);
      assert.ok(!item.executedLines.some(line => line.line === other), `${name} must not inherit the overlapping test's branch`);
    }
    assert.equal(this.report.run.exitCode, 0);
  }
  async expectSetupNotSilentlyCreditedToTestBodies(): Promise<void> {
    assert.equal(this.report.setups.length, 2);
    assert.ok(this.report.setups.every(item => item.executedLines.some(line => line.line === 13)));
    assert.ok(this.report.tests.every(item => !item.executedLines.some(line => line.line === 13)));
    assert.ok(this.report.limitations.some(line => line.includes("setup records")));
  }
  async expectFailureAndAvailableCoverageVisible(): Promise<void> {
    assert.equal(this.report.run.exitCode, 1);
    const failed = this.report.tests.find(item => item.name === "applies a member discount")!;
    assert.equal(failed.outcome, "failed");
    assert.ok(failed.executedLines.some(line => line.line === 4));
    assert.equal(this.report.tests.filter(item => item.outcome === "passed").length, 2);
    const html = await readFile(path.join(this.outputDirectory, "index.html"), "utf8");
    assert.match(html, /Test run failed/);
    assert.match(html, /Failed/);
  }
  async editSourceAfterMeasurement(): Promise<void> { await this.fixture.editSource(); }
  async addConfigurationAfterMeasurement(): Promise<void> {
    await writeFile(path.join(this.fixture.directory, "tsconfig.json"), '{"compilerOptions":{"strict":true}}\n');
  }
  async expectStaleEvidenceNotPresentedAsCurrentCoverage(): Promise<void> {
    assert.equal(this.report.stale, true);
    assert.ok(this.report.tests.every(item => item.changedHits.length === 0));
    assert.ok(this.report.changedLines.every(item => item.status === "unknown"));
    assert.ok(this.report.limitations.some(item => item.startsWith("STALE:")));
    const html = await readFile(path.join(this.outputDirectory, "index.html"), "utf8");
    assert.match(html, /Stale measurement/);
    assert.ok(!html.includes('class="context-hit"'));
    assert.ok(!html.includes('class="context-gap"'));
  }
}
