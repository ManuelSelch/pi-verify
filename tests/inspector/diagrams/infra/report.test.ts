import { beforeEach, afterEach, test } from 'node:test';
import { DiagramReportDriver } from './report.driver.js';

let report: DiagramReportDriver;
beforeEach(async () => { report = new DiagramReportDriver(); await report.createProject(); });
afterEach(async () => { await report.dispose(); });

test('CLI embeds automatically discovered Mermaid diagrams in the offline snapshot', async () => {
  await report.addDocument('docs/architecture.md', '# Architecture\n```mermaid\nflowchart LR\n A --> B\n```\n## Lifecycle\n```mermaid\nstateDiagram-v2\n A --> B\n```');

  await report.generate();

  report.shouldEmbedDiagrams(['Architecture', 'Lifecycle']);
  report.shouldBeSelfContained();
});

test('CLI keeps diagram data script-safe without altering the original source', async () => {
  await report.addDocument('README.md', '```mermaid\nflowchart LR\n A["</script><script>alert(1)</script>"]\n```');

  await report.generate();

  report.shouldKeepDiagramSource('flowchart LR\n A["</script><script>alert(1)</script>"]');
  report.shouldBeSelfContained();
});

test('CLI supports projects without diagrams', async () => {
  await report.generate();

  report.shouldEmbedDiagrams([]);
  report.shouldBeSelfContained();
});
