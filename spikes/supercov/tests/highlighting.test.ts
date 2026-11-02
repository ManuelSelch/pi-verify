import { afterEach, beforeEach, test } from "node:test";
import { HighlightingDriver } from "./highlighting.driver.ts";

// Approved rendering scenarios. Each test receives a fresh driver and temporary output.
let report: HighlightingDriver;
beforeEach(() => { report = new HighlightingDriver(); });
afterEach(async () => { await report.dispose(); });

test("highlights TypeScript source and both sides of a test diff", async () => {
  await report.prepareTypeScriptSourceAndEditedTest();
  await report.generatePortableReport();
  await report.expectSyntaxColorsInSourceAndDiff();
  await report.expectCopiedSourceAndDiffTextPreserved();
});

test("keeps coverage highlighting distinct from syntax and Git changes", async () => {
  await report.prepareCoveredAndUncoveredChangedLines();
  await report.generatePortableReport();
  await report.expectWholeFunctionContextWithSyntaxColors();
  await report.expectTealExecutedGutterAndAmberGapGutter();
  await report.expectContextLinesHaveNoCoverageHighlight();
});

test("keeps run evidence accessible without the removed explanatory footer", async () => {
  await report.prepareTypeScriptSourceAndEditedTest();
  await report.generatePortableReport();
  await report.expectCompactReportAndAccessibleEvidence();
});

test("embeds safe highlighted HTML without browser highlighting dependencies", async () => {
  await report.prepareSourceContainingHtmlAndScriptText();
  await report.generatePortableReport();
  await report.expectSourceEscapedWithoutExecutableMarkup();
  await report.expectNoHighlightingScriptsOrExternalAssetsRequired();
});
