import test from "node:test";
import { ReviewReportDriver } from "./review-report.driver.js";

test("records explicit comparison and truthful section provenance", async (t) => {
  const review = new ReviewReportDriver();
  t.after(() => review.dispose());
  await review.startRepository();
  await review.createCommittedChange();
  await review.createWorkingTreeChanges();
  await review.selectCommittedComparison();

  await review.finishWithAgentReportedCheck();

  await review.expectCommittedRevisionsAndExcludedWorkingTree();
  await review.expectVersionedProvenanceAndUnavailableAnalysis();
  await review.expectNoMeasurementCommandsRun();
});

test("reports an ambiguous comparison base instead of silently choosing", async (t) => {
  const review = new ReviewReportDriver();
  t.after(() => review.dispose());
  await review.startRepository();
  await review.configureAmbiguousBases();

  await review.finishWithoutSelectingBase();

  await review.expectAmbiguousBaseReported();
  await review.expectExistingOutputsAndEvidencePreserved();
});

test("preserves existing reports, evidence and single-message delivery", async (t) => {
  const review = new ReviewReportDriver();
  t.after(() => review.dispose());
  await review.startRepository();
  await review.createHistoricBundle();
  await review.attachEvidence();

  await review.finishWithAgentReportedCheck();

  await review.expectExistingOutputsAndEvidencePreserved();
  await review.expectOneReportMessage();
  await review.expectHistoricBundleUnchanged();
  await review.expectNoMeasurementCommandsRun();
});

test("an interrupted verification does not emit a completed report", async (t) => {
  const review = new ReviewReportDriver();
  t.after(() => review.dispose());
  await review.startRepository();
  await review.attachEvidence();

  await review.interruptVerification();

  await review.expectInterruptedRunDoesNotEmitReport();
});
