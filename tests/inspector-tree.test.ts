import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoverageTree, filterCoverageTree } from '../src/inspector/ui/tree.js';

test('groups files into sorted folders and aggregates executable lines', () => {
  const tree = buildCoverageTree([
    { path: 'src/z.ts', lines: [{ line: 1, hits: 1 }] },
    { path: 'src/inner/a.ts', lines: [{ line: 1, hits: 0 }, { line: 2, hits: 0 }, { line: 3, hits: 1 }] },
    { path: 'root.ts', lines: [] },
  ]);
  assert.deepEqual(tree.map(n => n.name), ['src', 'root.ts']);
  assert.deepEqual([tree[0].hit, tree[0].found], [2, 4]);
  assert.deepEqual(tree[0].children?.map(n => n.name), ['inner', 'z.ts']);
  assert.equal(tree[0].children?.[0].children?.[0].index, 1);
});

test('filter retains matching files and their ancestors, and matches folder paths', () => {
  const tree = buildCoverageTree([{path:'src/foo/a.ts',lines:[]},{path:'src/bar/b.ts',lines:[]}]);
  assert.equal(filterCoverageTree(tree, 'a.ts')[0].children?.length, 1);
  assert.equal(filterCoverageTree(tree, 'foo')[0].children?.[0].children?.[0].name, 'a.ts');
  assert.deepEqual(filterCoverageTree(tree, 'missing'), []);
});
