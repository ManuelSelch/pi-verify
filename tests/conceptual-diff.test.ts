import test, { type TestContext } from "node:test";
import { ConceptualDiffDriver } from "./conceptual-diff.driver.js";

function project(t: TestContext) {
  const driver = new ConceptualDiffDriver();
  t.after(() => driver.dispose());
  driver.givenProjectDiagram();
  return driver;
}

test("another project can diff its configured diagram without a source-code guardrail", async (t) => {
  const app = project(t);
  app.changeLabel();
  app.leaveUncommittedConfiguration();

  await app.compare();

  app.thenLabelChangedWithoutCodeCheck();
});

test("the conventional diagram path works without configuration or source code", async (t) => {
  const app = project(t);
  app.useConventionalDiagramWithoutConfiguration();

  await app.compare();

  app.thenLabelChangedWithoutCodeCheck();
});

test("removing a project diagram retains its historical comparison", async (t) => {
  const app = project(t);
  app.removeDiagram();

  await app.compare();

  app.thenDiagramRemoved();
});

test("diagram-only diffs ignore layout movements", async (t) => {
  const app = project(t);
  app.moveBox();

  await app.compare();

  app.thenNoSemanticChange();
});

test("each revision selects its own committed diagram path", async (t) => {
  const app = project(t);
  app.moveDiagram();

  await app.compare();

  app.thenNoSemanticChange();
});

test("regular verify and standalone reports expose diagram diffs without claiming conformance", async (t) => {
  const app = project(t);
  app.changeLabel();

  await app.generateVerifyReport();
  app.generateStandaloneReport();

  app.thenReportExplainsUncheckedDiagram();
});

test("invalid project configuration fails rather than silently selecting a different diagram", async (t) => {
  const app = project(t);
  app.configureInvalidPath();

  await app.thenInvalidConfigurationRejected();
});
