import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../../../src/inspector/cli.js', import.meta.url));
export class ReportsDriver {
  private root = mkdtempSync(path.join(tmpdir(), 'inspector-reports-'));
  private result?: ReturnType<typeof spawnSync>;
  private data: any;

  report(file: string, xml: string) {
    mkdirSync(path.dirname(path.join(this.root, file)), { recursive: true });
    writeFileSync(path.join(this.root, file), xml);
  }
  alias(alias: string, target: string) { symlinkSync(path.join(this.root, target), path.join(this.root, alias)); }
  importReports(...reports: string[]) {
    this.result = spawnSync(process.execPath, [cli, '--no-open', ...reports.flatMap(file => ['--junit', file])], { cwd: this.root, encoding: 'utf8' });
    if (this.result.status === 0) {
      const html = readFileSync(path.join(this.root, 'inspector-report.html'), 'utf8');
      this.data = JSON.parse(html.match(/<script id="inspector-data" type="application\/json">(.*?)<\/script>/s)![1]);
    }
  }
  shouldImport(paths: string[], statuses: string[]) {
    assert.equal(this.result?.status, 0, String(this.result?.stderr));
    assert.deepEqual(this.data.reports.junit.map((report: any) => report.path), paths);
    assert.deepEqual(this.data.tests.map((test: any) => test.status), statuses);
    assert.deepEqual(this.data.tests.map((test: any) => test.report), paths.length === 1 ? statuses.map(() => paths[0]) : paths);
  }
  shouldHaveTotals(totals: object[]) { assert.deepEqual(this.data.reports.junit.map((report: any) => report.totals), totals); }
  shouldFailFor(file: string) {
    assert.notEqual(this.result?.status, 0);
    assert.match(String(this.result?.stderr), new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(this.data, undefined);
  }
  shouldIncludeSource(file: string) {
    assert.equal(this.data.tests[0].file, file);
    assert.equal(this.data.tests[0].source, 'test source');
  }
  dispose() { rmSync(this.root, { recursive: true, force: true }); }
}
