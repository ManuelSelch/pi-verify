import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJUnit, parseLcov } from '../src/inspector/parse.js';

 test('reads JUnit suites, outcomes and failure messages', () => {
  const result = parseJUnit('<testsuites><testsuite name="suite"><testcase name="works" time="0.2"/><testcase name="breaks"><failure message="oops">stack</failure></testcase><testcase name="later"><skipped/></testcase></testsuite></testsuites>');
  assert.deepEqual(result.map(t => [t.name, t.status]), [['works', 'passed'], ['breaks', 'failed'], ['later', 'skipped']]);
  assert.equal(result[1].message, 'oops\nstack');
});

test('reads test cases directly under testsuites', () => {
  const result = parseJUnit('<testsuites><testcase name="works" file="tests/example.test.ts"/></testsuites>');

  assert.deepEqual(result.map(t => [t.name, t.file]), [['works', 'tests/example.test.ts']]);
});

test('normalizes path-like classnames without treating Java classnames as file paths', () => {
  const result = parseJUnit('<testsuites><testsuite name="suite"><testcase name="browser" classname="tests/example.spec.ts"/><testcase name="java" classname="com.example.Tests"/><testcase name="explicit" file="real.ts" classname="other.spec.ts" line="12" column="3"/></testsuite></testsuites>');

  assert.deepEqual(result.map(t => t.file), ['tests/example.spec.ts', undefined, 'real.ts']);
  assert.equal(result[2].line, 12);
  assert.equal(result[2].column, 3);
});

test('accepts explicitly empty JUnit suites', () => {
  assert.deepEqual(parseJUnit('<testsuites/>'), []);
  assert.deepEqual(parseJUnit('<testsuite name="empty"/>'), []);
});

test('rejects invalid JUnit instead of reporting an empty suite', () => {
  assert.throws(() => parseJUnit('<unrelated/>'), /JUnit/);
});

test('reads LCOV lines, functions and branches without inventing missing data', () => {
  const [file] = parseLcov('SF:src/a.ts\nDA:1,2\nDA:2,0\nFNF:2\nFNH:1\nBRF:2\nBRH:1\nend_of_record\n');
  assert.equal(file.path, 'src/a.ts');
  assert.deepEqual(file.lines, [{ line: 1, hits: 2 }, { line: 2, hits: 0 }]);
  assert.deepEqual(file.functions, { found: 2, hit: 1 });
  assert.deepEqual(file.branches, { found: 2, hit: 1 });
});

test('rejects malformed or incomplete LCOV', () => {
  assert.throws(() => parseLcov('SF:x\nDA:1,nope\nend_of_record\n'), /LCOV/);
  assert.throws(() => parseLcov('SF:x\nDA:1,1\n'), /LCOV/);
});
