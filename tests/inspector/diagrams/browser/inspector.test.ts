import { beforeEach, afterEach, test } from 'node:test';
import { InspectorDriver } from './inspector.driver.js';

let inspector: InspectorDriver;
beforeEach(async () => { inspector = new InspectorDriver(); await inspector.createProject(); });
afterEach(async () => { await inspector.dispose(); });

test('renders real Mermaid diagrams offline with compact previews', async () => {
  await inspector.addArchitecture();
  await inspector.openReport();

  await inspector.openDiagrams();

  await inspector.shouldShowDiagrams(2);
  await inspector.shouldKeepCompactPreviews();
  await inspector.shouldBeSafeAndOffline();
});

test('architecture, state and mindmap renderers are bundled for offline use', async () => {
  await inspector.addOtherDiagramTypes();
  await inspector.openReport();

  await inspector.openDiagrams();

  await inspector.shouldShowDiagrams(3);
  await inspector.shouldBeSafeAndOffline();
});

test('presentation fills most of the screen, fits on resize, and restores preview and focus on Escape', async () => {
  await inspector.addArchitecture();
  await inspector.openReport();
  await inspector.openDiagrams();

  await inspector.expand('System overview');

  await inspector.shouldShowPresentation('System overview');
  await inspector.shouldFitPresentation();

  await inspector.zoomIn();

  await inspector.shouldShowZoom(125);

  await inspector.resetZoom();
  await inspector.useNarrowScreen();

  await inspector.shouldFitPresentation();
  await inspector.shouldShowZoom(100);

  await inspector.useSmallScreen();

  await inspector.shouldFitPresentation();

  await inspector.dismissPresentation();

  await inspector.shouldRestorePreview('System overview');
  await inspector.shouldKeepCompactPreviews();
  await inspector.shouldBeSafeAndOffline();
});

test('tall diagrams fit both dimensions in the presentation view', async () => {
  await inspector.addTallDiagram();
  await inspector.openReport();
  await inspector.openDiagrams();

  await inspector.expand('Tall diagram');

  await inspector.shouldFitPresentation();

  await inspector.useSmallScreen();

  await inspector.shouldFitPresentation();

  await inspector.closePresentation();

  await inspector.shouldRestorePreview('Tall diagram');
});

test('invalid syntax is isolated and never exposes diagram source', async () => {
  await inspector.addInvalidDiagram();
  await inspector.addArchitecture();
  await inspector.openReport();

  await inspector.openDiagrams();

  await inspector.shouldShowIsolatedError();
  await inspector.shouldBeSafeAndOffline();
});

test('empty diagram view leaves existing report journeys intact', async () => {
  await inspector.openReport();
  await inspector.openDiagrams();

  await inspector.shouldShowEmptyState();

  await inspector.openMetrics();

  await inspector.shouldShowMetrics();

  await inspector.openTests();

  await inspector.shouldShowTests();

  await inspector.openCoverage();

  await inspector.shouldShowCoverage();
  await inspector.shouldBeSafeAndOffline();
});

test('navigation while rendering does not leave stale diagrams or renderer hosts', async () => {
  await inspector.addArchitecture();
  await inspector.openReport();
  await inspector.openDiagrams();
  await inspector.openMetrics();
  await inspector.openDiagrams();

  await inspector.shouldShowDiagrams(2);
  await inspector.shouldBeSafeAndOffline();
});

test('document titles and Mermaid labels cannot inject executable markup', async () => {
  await inspector.addUnsafeDiagram();
  await inspector.openReport();

  await inspector.openDiagrams();

  await inspector.shouldShowDiagrams(1);
  await inspector.shouldBeSafeAndOffline();
});
