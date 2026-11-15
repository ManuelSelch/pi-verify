import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramsHtml, presentationHtml } from '../../../../src/inspector/diagrams/ui/components/html.js';

const diagrams = [
  { title: 'Overview <unsafe>', file: 'docs/a.md', line: 4, source: 'PRIVATE MERMAID SOURCE' },
  { title: 'Lifecycle', file: 'docs/a.md', line: 12, source: 'PRIVATE MERMAID SOURCE' },
  { title: 'Overview', file: 'README.md', line: 2, source: 'PRIVATE MERMAID SOURCE' },
];

test('groups cards by document and provides an icon-only expand action without source controls or counts', () => {
  const html = diagramsHtml(diagrams, '<svg></svg>');

  assert.equal((html.match(/<h2>docs\/a.md<\/h2>/g) ?? []).length, 1);
  assert.equal((html.match(/class="panel diagram-card"/g) ?? []).length, 3);
  assert.match(html, /docs\/a.md:4/);
  assert.match(html, /aria-label="Expand Overview &lt;unsafe&gt;" disabled><svg><\/svg><\/button>/);
  assert.doesNotMatch(html, /PRIVATE MERMAID SOURCE|<unsafe>|Source|2 diagrams|3 diagrams/);
});

test('offers an actionable empty state', () => {
  assert.match(diagramsHtml([], ''), /No Mermaid diagrams found/);
  assert.match(diagramsHtml([], ''), /regenerate the inspector report/);
});

test('presentation header contains zoom, reset and close controls but no document path or source tab', () => {
  const html = presentationHtml('Overview', { minus: '<svg/>', plus: '<svg/>', close: '<svg/>' });

  assert.match(html, /diagram-dialog-header.*data-zoom="out".*data-zoom="reset".*data-zoom="in".*data-close-diagram/);
  assert.match(html, /diagram-stage/);
  assert.doesNotMatch(html, /docs\/|Source|source|\.md/);
});
