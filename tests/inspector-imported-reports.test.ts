import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importedReportsHtml } from '../src/inspector/reports/ui/components/html.js';

test('identifies each imported report and its own test-case totals with safe text', () => {
  const html = importedReportsHtml([
    { path: '<script>.xml', totals: { tests: 2, passed: 1, failed: 1, skipped: 0 } },
    { path: 'browser.xml', totals: { tests: 3, passed: 1, failed: 0, skipped: 2 } },
  ]);

  assert.match(html, /Imported report: &lt;script&gt;\.xml — 2 test cases, 1 passed, 1 failed, 0 skipped/);
  assert.match(html, /Imported report: browser\.xml — 3 test cases, 1 passed, 0 failed, 2 skipped/);
  assert.doesNotMatch(html, /<script>/);
});

test('missing reports are unavailable, not zero failures', () => {
  const html = importedReportsHtml([]);

  assert.match(html, /unavailable/);
  assert.doesNotMatch(html, /0 failed/);
});
