import { afterEach, beforeEach, test } from 'node:test';
import { ReportsDriver } from './inspector/reports/infra/reports.driver.js';

let reports: ReportsDriver;
beforeEach(() => { reports = new ReportsDriver(); });
afterEach(() => reports.dispose());
const passed = '<testsuite><testcase name="same"/></testsuite>';
const failed = '<testsuite><testcase name="same"><failure message="broken"/></testcase></testsuite>';

test('discovers all matching reports and retains identical test names with independent totals', () => {
  reports.report('junit.xml', passed);
  reports.report('test-results/junit.xml', failed);

  reports.importReports();

  reports.shouldImport(['junit.xml', 'test-results/junit.xml'], ['passed', 'failed']);
  reports.shouldHaveTotals([{ tests: 1, passed: 1, failed: 0, skipped: 0 }, { tests: 1, passed: 0, failed: 1, skipped: 0 }]);
});

test('repeated explicit reports replace discovery and deduplicate canonical paths, not test names', () => {
  reports.report('junit.xml', failed);
  reports.report('one.xml', passed);
  reports.report('two.xml', passed);
  reports.alias('alias.xml', 'one.xml');

  reports.importReports('one.xml', './one.xml', 'alias.xml', 'two.xml');

  reports.shouldImport(['one.xml', 'two.xml'], ['passed', 'passed']);
});

test('does not silently drop a missing report alongside a valid report', () => {
  reports.report('one.xml', passed);

  reports.importReports('one.xml', 'missing.xml');

  reports.shouldFailFor('missing.xml');
});

test('does not silently drop an invalid discovered report alongside a valid report', () => {
  reports.report('junit.xml', passed);
  reports.report('test-results/junit.xml', '<not-junit/>');

  reports.importReports();

  reports.shouldFailFor('test-results/junit.xml');
});

test('retains every outcome and duplicate test name within a report', () => {
  reports.report('junit.xml', '<testsuite><testcase name="same"/><testcase name="same"><error>broken</error></testcase><testcase name="same"><skipped/></testcase></testsuite>');

  reports.importReports();

  reports.shouldImport(['junit.xml'], ['passed', 'failed', 'skipped']);
  reports.shouldHaveTotals([{ tests: 3, passed: 1, failed: 1, skipped: 1 }]);
});

test('deduplicates automatically discovered aliases of the same report', () => {
  reports.report('junit.xml', passed);
  reports.alias('test-results.xml', 'junit.xml');

  reports.importReports();

  reports.shouldImport(['junit.xml'], ['passed']);
});

test('imports Playwright classname locations and project-local source', () => {
  reports.report('tests/example.spec.ts', 'test source');
  reports.report('junit.xml', '<testsuites><testsuite name="tests/example.spec.ts" hostname="chromium"><testcase classname="tests/example.spec.ts" name="works" time="0.1"/></testsuite></testsuites>');

  reports.importReports();

  reports.shouldImport(['junit.xml'], ['passed']);
  reports.shouldIncludeSource('tests/example.spec.ts');
});
