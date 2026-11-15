import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestTree, filterTestTree } from '../src/inspector/ui/test-tree.js';

const tests = [
  { name: 'passes', status: 'passed', file: 'tests/unit/parse.test.ts' },
  { name: 'fails', status: 'failed', file: 'tests/unit/parse.test.ts' },
  { name: 'browser', status: 'passed', file: 'tests/ui/module.dom.test.ts' },
  { name: 'unknown', status: 'skipped' },
];

test('groups every result by path and opens only failed ancestors by default', () => {
  const tree = buildTestTree(tests);
  const root = tree.find(node => node.name === 'tests')!;
  const unit = root.children!.find(node => node.name === 'unit')!;
  const file = unit.children![0];
  const ui = root.children!.find(node => node.name === 'ui')!;

  assert.equal(root.failed, true);
  assert.equal(unit.failed, true);
  assert.equal(file.name, 'parse');
  assert.deepEqual(file.tests, [0, 1]);
  assert.equal(ui.failed, false);
  assert.equal(ui.children![0].name, 'module.dom');
  assert.deepEqual(tree.find(node => node.name === 'Unknown location')!.tests, [3]);
});

test('filters by full path or test name without losing matching results', () => {
  const tree = buildTestTree(tests);
  assert.deepEqual(filterTestTree(tree, 'fails')[0].children![0].children![0].tests, [1]);
  assert.deepEqual(filterTestTree(tree, 'parse.test.ts')[0].children![0].children![0].tests, [0, 1]);
  assert.deepEqual(filterTestTree(tree, 'nothing'), []);
});
