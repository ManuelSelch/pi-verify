import test from "node:test";
import { ReviewHtmlDriver } from "./review-html.driver.js";

test("finishing adds a portable HTML report without replacing existing outputs", async (t) => {
  const review = new ReviewHtmlDriver();
  t.after(() => review.dispose());
  await review.prepareVerification();

  await review.finishVerification();

  await review.expectPortableHtmlAlongsideExistingOutputs();
  await review.expectOneMessageWithHtmlLink();
  await review.expectNoNetworkAssetsOrMeasurementRuns();
});

test("report navigation presents the available information and unavailable analysis honestly", async (t) => {
  const review = new ReviewHtmlDriver();
  t.after(() => review.dispose());
  await review.prepareVerification();

  await review.finishVerification();

  await review.expectSectionsAndHonestUnavailableStates();
  await review.expectAccessibleResponsiveNavigation();
});

test("selected evidence remains accessible in a portable bundle", async (t) => {
  const review = new ReviewHtmlDriver();
  t.after(() => review.dispose());
  await review.prepareVerification();
  await review.attachSelectedImageLogVideoAndOtherFile();

  await review.finishVerification();

  await review.expectSelectedEvidenceAndPortableLinks();
});

test("untrusted summaries and artifact names cannot execute in the report", async (t) => {
  const review = new ReviewHtmlDriver();
  t.after(() => review.dispose());
  await review.prepareVerification();
  await review.includeUntrustedReportContent();

  await review.finishVerification();

  await review.expectUntrustedContentIsInert();
});
