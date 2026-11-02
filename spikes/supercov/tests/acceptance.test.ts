import test, { afterEach, beforeEach } from "node:test";
import { SupercovSpikeDriver } from "./spike.driver.ts";

// Standalone acceptance scenarios: each collection invokes the pinned real Supercov.
// These scenarios run serially; every test receives a fresh driver.
let spike: SupercovSpikeDriver;

beforeEach(() => {
  spike = new SupercovSpikeDriver();
});

afterEach(async () => {
  await spike.dispose();
});

test("attributes original TypeScript lines to individual named tests", async () => {
  await spike.prepareTypeScriptFixture();
  await spike.measureWithSupercov();
  await spike.expectDistinctTestIdentitiesAndOutcomes();
  await spike.expectEachTestCoversItsOwnBranchNotTheOther();
});

test("attributes compiled JavaScript execution back to original TypeScript lines", async () => {
  await spike.prepareCompiledTypeScriptFixture();
  await spike.measureWithSupercov();
  await spike.expectDistinctTestIdentitiesAndOutcomes();
  await spike.expectEachTestCoversItsOwnBranchNotTheOther();
});

test("shows tests covering changed lines separately from changed tests", async () => {
  await spike.prepareFixtureWithCommittedBaseAndWorkingTreeChanges();
  await spike.measureWithSupercov();
  await spike.generateReport();
  await spike.expectAddedAndModifiedTestsSeparateFromCoveringTests();
  await spike.expectUnchangedTestCoveringChangedCodeIncluded();
  await spike.expectUncoveredChangedExecutableLineVisible();
  await spike.expectPortableHtmlAndNeutralJson();
});

test("does not invent attribution for overlapping async tests or setup", async () => {
  await spike.prepareOverlappingTestsWithSetup();
  await spike.measureWithSupercov();
  await spike.expectExactDisjointAttributionOrExplicitUnsupported();
  await spike.expectSetupNotSilentlyCreditedToTestBodies();
});

test("retains measured evidence when a test fails without reporting success", async () => {
  await spike.prepareFailingTest();
  await spike.measureWithSupercov();
  await spike.generateReport();
  await spike.expectFailureAndAvailableCoverageVisible();
});

test("rejects evidence after a configuration file is added", async () => {
  await spike.prepareTypeScriptFixture();
  await spike.measureWithSupercov();
  await spike.addConfigurationAfterMeasurement();
  await spike.generateReport();
  await spike.expectStaleEvidenceNotPresentedAsCurrentCoverage();
});

test("rejects stale evidence rather than mapping it onto changed source", async () => {
  await spike.prepareTypeScriptFixture();
  await spike.measureWithSupercov();
  await spike.editSourceAfterMeasurement();
  await spike.generateReport();
  await spike.expectStaleEvidenceNotPresentedAsCurrentCoverage();
});
