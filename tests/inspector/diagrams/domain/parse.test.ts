import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiagrams } from '../../../../src/inspector/diagrams/domain/parse.js';

test('extracts each Mermaid fence with heading, source path and fence line', () => {
  const result = parseDiagrams('# Architecture\n\n```mermaid\nflowchart LR\n A --> B\n```\n\n## Report **generation**\n~~~mermaid\nsequenceDiagram\n A->>B: Report\n~~~\n', 'docs/architecture.md');

  assert.deepEqual(result, [
    { title: 'Architecture', file: 'docs/architecture.md', line: 3, source: 'flowchart LR\n A --> B' },
    { title: 'Report generation', file: 'docs/architecture.md', line: 9, source: 'sequenceDiagram\n A->>B: Report' },
  ]);
});

test('does not discover Mermaid examples nested inside a different fenced block or inline code', () => {
  const result = parseDiagrams('````markdown\n# Not a heading\n```mermaid\nA --> B\n```\n````\n`mermaid`\n```js\nconst mermaid = true;\n```', 'README.md');

  assert.deepEqual(result, []);
});

test('supports setext headings, nested fences and CRLF input', () => {
  const result = parseDiagrams('Lifecycle\r\n=========\r\n\r\n> ~~~mermaid\r\n> stateDiagram-v2\r\n> A --> B\r\n> ~~~\r\n', 'guide.MD');

  assert.deepEqual(result, [{ title: 'Lifecycle', file: 'guide.MD', line: 4, source: 'stateDiagram-v2\nA --> B' }]);
});

test('keeps invalid and empty diagrams and supplies deterministic titles without headings', () => {
  const result = parseDiagrams('```mermaid\nnot a valid diagram\n```\n\n```MERMAID\n```', 'docs/example.md');

  assert.deepEqual(result.map(d => [d.title, d.source]), [['example.md — diagram 1', 'not a valid diagram'], ['example.md — diagram 2', '']]);
});
