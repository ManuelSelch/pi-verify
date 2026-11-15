import { beforeEach, afterEach, test } from 'node:test';
import { DiscoveryDriver } from './discovery.driver.js';

let project: DiscoveryDriver;
beforeEach(async () => { project = new DiscoveryDriver(); await project.createProject(); });
afterEach(async () => { await project.dispose(); });

test('discovers nested Markdown documents in deterministic path order without Git', async () => {
  await project.addDocument('docs/z.MD');
  await project.addDocument('docs/a.markdown');
  await project.addDocument('README.md');
  await project.addDocument('not-markdown.txt');

  await project.discover();

  project.shouldFindDocuments(['README.md', 'docs/a.markdown', 'docs/z.MD']);
});

test('excludes dependency, generated directories and symlinked documents', async () => {
  await project.addDocument('README.md');
  await project.addDocument('node_modules/package/README.md');
  await project.addDocument('dist/guide.md');
  await project.addDocument('.git/guide.md');
  await project.addDocument('coverage/guide.md');
  await project.addLinkedDocument('linked.md', 'README.md');

  await project.discover();

  project.shouldFindDocuments(['README.md']);
});

test('includes tracked and untracked documents but respects Git ignores', async () => {
  project.useGit();
  await project.ignore('private/');
  await project.addDocument('private/secret.md');
  await project.addDocument('tracked.md');
  project.track('tracked.md');
  await project.addDocument('new.md');

  await project.discover();

  project.shouldFindDocuments(['new.md', 'tracked.md']);
});

test('returns an empty collection when no Mermaid blocks exist', async () => {
  await project.addDocument('README.md', '# Documentation\nNo diagrams.');

  await project.discover();

  project.shouldFindDocuments([]);
});

test('keeps invalid diagrams for isolated errors in the report', async () => {
  await project.addDocument('README.md', '```mermaid\nbroken Mermaid\n```');

  await project.discover();

  project.shouldKeepInvalidDiagram();
});
